import { supabase } from '../../lib/supabase';
import type { ClaraCall, CallStatus, CallTracking } from './types';

// Normalizar teléfonos para cruzar números
export const normalizePhone = (phone?: string): string => {
    if (!phone) return '';
    let clean = phone.replace(/[^0-9]/g, '');
    if (clean.startsWith('34') && clean.length === 11) {
        clean = clean.substring(2);
    }
    return clean;
};

// Formatear teléfono para visualización (+34 699 60 80 46)
export const formatPhoneDisplay = (phone: string): string => {
    const clean = normalizePhone(phone);
    if (clean.length === 9) {
        return `${clean.slice(0, 3)} ${clean.slice(3, 5)} ${clean.slice(5, 7)} ${clean.slice(7, 9)}`;
    }
    return phone || 'Desconocido';
};

// Extraer teléfono del texto del mensaje
export const extractPhoneFromMessage = (message: string): string => {
    if (!message) return '';

    // Patrón 1: "Teléfono: +34699608046" o "Teléfono: 699608046"
    const telMatch = message.match(/Tel[ée]fono:\s*([^\s|,;.]+)/i);
    if (telMatch && telMatch[1] && telMatch[1].toLowerCase() !== 'desconocido') {
        return telMatch[1];
    }

    // Patrón 2: "El contacto (699608046)"
    const contactMatch = message.match(/contacto\s*\(([^)]+)\)/i);
    if (contactMatch && contactMatch[1]) {
        return contactMatch[1];
    }

    // Patrón 3: cualquier número español de 9 dígitos que empiece por 6, 7, 8 o 9
    const regexMatch = message.match(/(?:\+34|0034)?([6789]\d{8})/);
    if (regexMatch && regexMatch[1]) {
        return regexMatch[1];
    }

    return '';
};

// Extraer resumen limpio del mensaje
export const extractSummaryFromMessage = (message: string): string => {
    if (!message) return 'Sin detalles disponibles.';

    if (message.includes('| Resumen:')) {
        return message.split('| Resumen:')[1].trim();
    }
    if (message.includes('Motivo/Resumen:')) {
        return message.split('Motivo/Resumen:')[1].trim();
    }
    return message.trim();
};

// Obtener todas las llamadas de Clara con su seguimiento y paciente asociado
export const getClaraCalls = async (): Promise<ClaraCall[]> => {
    try {
        // 1. Obtener todas las notificaciones generadas por la IA / llamadas
        const { data: dbNotifications, error: notifError } = await supabase
            .from('system_notifications')
            .select('*')
            .or('type.ilike.AI_LOG,type.ilike.BOT,title.ilike.%Llamada%,title.ilike.%Cita%,title.ilike.%Asistente%')
            .order('created_at', { ascending: false })
            .limit(200);

        if (notifError) throw notifError;
        if (!dbNotifications || dbNotifications.length === 0) return [];

        // 2. Obtener registros de seguimiento en audit_logs
        const { data: trackingLogs } = await supabase
            .from('audit_logs')
            .select('*')
            .eq('category', 'system')
            .eq('action', 'CALL_TRACKING')
            .order('timestamp', { ascending: false });

        // Mapear el seguimiento más reciente para cada llamada
        const trackingMap = new Map<string, CallTracking>();
        if (trackingLogs) {
            trackingLogs.forEach((log: any) => {
                try {
                    const parsed = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
                    if (parsed && parsed.callId && !trackingMap.has(parsed.callId)) {
                        trackingMap.set(parsed.callId, {
                            callId: parsed.callId,
                            status: parsed.status as CallStatus,
                            returnedAt: parsed.returnedAt,
                            returnedBy: parsed.returnedBy || log.user_name,
                            notes: parsed.notes,
                            updatedAt: parsed.updatedAt || log.timestamp
                        });
                    }
                } catch (_) {
                    // ignorar json no válido
                }
            });
        }

        // 3. Obtener pacientes para asociar teléfonos
        const { data: patientsData } = await supabase
            .from('patients')
            .select('id, first_name, last_name, phone, patient_tutors (phone)')
            .limit(500);

        // Mapa de teléfonos normalizados a pacientes
        const phoneToPatient = new Map<string, { id: string; name: string }>();
        if (patientsData) {
            patientsData.forEach((p: any) => {
                const fullName = `${p.first_name || ''} ${p.last_name || ''}`.trim();
                const mainPhone = normalizePhone(p.phone);
                if (mainPhone) {
                    phoneToPatient.set(mainPhone, { id: p.id, name: fullName });
                }
                const tutors = p.patient_tutors || [];
                tutors.forEach((t: any) => {
                    const tutorPhone = normalizePhone(t.phone);
                    if (tutorPhone && !phoneToPatient.has(tutorPhone)) {
                        phoneToPatient.set(tutorPhone, { id: p.id, name: `${fullName} (Tutor)` });
                    }
                });
            });
        }

        // 4. Construir listado unificado de ClaraCall
        return dbNotifications.map((n: any) => {
            const rawPhone = extractPhoneFromMessage(n.message || '');
            const normalized = normalizePhone(rawPhone);
            const matchedPatient = normalized ? phoneToPatient.get(normalized) : undefined;
            const tracking = trackingMap.get(n.id);

            // Determinar estado por defecto si aún no ha sido reportado en audit_logs
            let resolvedTracking = tracking;
            if (!resolvedTracking) {
                let defaultStatus: CallStatus = 'INFO_ONLY';
                const lowerTitle = (n.title || '').toLowerCase();
                if (lowerTitle.includes('devolver llamada') || lowerTitle.includes('solicitud de cita') || lowerTitle.includes('reserva') || lowerTitle.includes('revisar')) {
                    defaultStatus = 'PENDING';
                }

                resolvedTracking = {
                    callId: n.id,
                    status: defaultStatus,
                    updatedAt: n.created_at
                };
            }

            return {
                id: n.id,
                date: new Date(n.created_at),
                phone: rawPhone,
                patientId: matchedPatient?.id,
                patientName: matchedPatient?.name,
                title: n.title,
                summary: extractSummaryFromMessage(n.message || ''),
                rawMessage: n.message || '',
                isDismissed: n.is_dismissed === true,
                tracking: resolvedTracking
            };
        });
    } catch (error) {
        console.error('Error fetching Clara calls:', error);
        return [];
    }
};

// Guardar el seguimiento de una llamada (cuándo se devolvió, quién y qué se habló)
export const saveCallTracking = async (
    callId: string,
    tracking: {
        status: CallStatus;
        returnedAt?: string;
        returnedBy?: string;
        notes?: string;
    }
): Promise<boolean> => {
    try {
        const timestamp = new Date().toISOString();
        const trackingPayload: CallTracking = {
            callId,
            status: tracking.status,
            returnedAt: tracking.returnedAt || timestamp,
            returnedBy: tracking.returnedBy || 'Administración',
            notes: tracking.notes || '',
            updatedAt: timestamp
        };

        // 1. Guardar en audit_logs de Supabase (persistente e histórico)
        const { error: auditError } = await supabase
            .from('audit_logs')
            .insert({
                user_name: trackingPayload.returnedBy,
                action: 'CALL_TRACKING',
                category: 'system',
                details: JSON.stringify(trackingPayload),
                timestamp: timestamp
            });

        if (auditError) {
            console.error('Error saving tracking in audit_logs:', auditError);
        }

        // 2. Actualizar estado en system_notifications
        // Si está devuelta o informativa -> is_dismissed: true (ya gestionada)
        // Si está pendiente o no contesta -> is_dismissed: false (requiere atención)
        const isManaged = tracking.status === 'RETURNED' || tracking.status === 'INFO_ONLY';
        await supabase
            .from('system_notifications')
            .update({
                is_dismissed: isManaged,
                read: true
            })
            .eq('id', callId);

        // Disparar evento para actualizar el Dashboard y el registro en vivo
        window.dispatchEvent(new CustomEvent('calls-updated', { detail: { callId, status: tracking.status } }));

        return true;
    } catch (error) {
        console.error('Error in saveCallTracking:', error);
        return false;
    }
};
