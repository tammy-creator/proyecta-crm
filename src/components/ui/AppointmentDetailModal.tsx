import React from 'react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { X, User, Clock, AlertTriangle, FileText, DollarSign, Calendar } from 'lucide-react';
import { type Appointment } from '../../modules/calendar/types';

interface AppointmentDetailModalProps {
    appointment: Appointment | null;
    isOpen: boolean;
    onClose: () => void;
}

const AppointmentDetailModal: React.FC<AppointmentDetailModalProps> = ({ appointment, isOpen, onClose }) => {
    if (!isOpen || !appointment) return null;

    const apptDate = parseISO(appointment.start);
    const dateStr = format(apptDate, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es });
    const startTime = format(apptDate, 'HH:mm');
    const endTime = format(parseISO(appointment.end), 'HH:mm');

    return (
        <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: '500px' }}>
                <div className="modal-header">
                    <h3>Detalles de la Cita</h3>
                    <button className="btn-icon-round" onClick={onClose}><X size={20} /></button>
                </div>

                <div className="modal-form">
                    <div className="form-group">
                        <label className="flex items-center gap-2">
                            <User size={14} className="text-secondary" /> Paciente
                        </label>
                        <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 font-medium">
                            {appointment.patientName}
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="flex items-center gap-2">
                            <User size={14} className="text-secondary" /> Terapeuta
                        </label>
                        <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                            {appointment.therapistName}
                        </div>
                    </div>

                    <div className="flex gap-4">
                        <div className="form-group flex-1">
                            <label className="flex items-center gap-2"><Calendar size={14} className="text-secondary" /> Fecha</label>
                            <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                                {dateStr}
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-4">
                        <div className="form-group flex-1">
                            <label className="flex items-center gap-2"><Clock size={14} className="text-secondary" /> Hora Inicio</label>
                            <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 text-center">
                                {startTime}
                            </div>
                        </div>
                        <div className="form-group flex-1">
                            <label className="flex items-center gap-2"><Clock size={14} className="text-secondary" /> Hora Fin</label>
                            <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 text-center">
                                {endTime}
                            </div>
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="flex items-center gap-2">Servicio Clínico</label>
                        <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                            {appointment.type}
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="flex items-center gap-2">Estado</label>
                        <div className={`p-3 rounded-lg border font-bold text-center ${appointment.status === 'Cobrada' ? 'bg-green-50 border-green-200 text-green-700' :
                                appointment.status === 'En Sesión' ? 'bg-orange-50 border-orange-200 text-orange-700' :
                                    appointment.status === 'Cancelada' ? 'bg-red-50 border-red-200 text-red-700' :
                                        'bg-blue-50 border-blue-200 text-blue-700'
                            }`}>
                            {appointment.status}
                        </div>
                    </div>

                    {appointment.status === 'Cancelada' && appointment.cancellationReason && (
                        <div className="form-group">
                            <label className="flex items-center gap-2"><AlertTriangle size={14} className="text-danger" /> Motivo de Cancelación</label>
                            <div className="p-3 bg-red-50 rounded-lg border border-red-100 text-red-700 italic">
                                {appointment.cancellationReason}
                            </div>
                        </div>
                    )}

                    {appointment.sessionDiary && (
                        <div className="form-group">
                            <label className="flex items-center gap-2">
                                <FileText size={14} className="text-secondary" /> Diario de Sesión
                            </label>
                            <div className="p-3 bg-blue-50/30 rounded-lg border border-blue-100 whitespace-pre-wrap italic text-sm">
                                {appointment.sessionDiary}
                            </div>
                        </div>
                    )}

                    <div className="form-group">
                        <label className="flex items-center gap-2">
                            <DollarSign size={14} className="text-secondary" /> Pago
                        </label>
                        <div className={`p-3 rounded-lg border flex items-center gap-2 ${appointment.isPaid ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                            {appointment.isPaid ? (
                                <>✅ Confirmado</>
                            ) : (
                                <>❌ Pendiente de cobro</>
                            )}
                        </div>
                    </div>
                </div>

                <div className="modal-footer">
                    <button className="btn-secondary w-full" onClick={onClose}>Cerrar</button>
                </div>
            </div>
        </div>
    );
};

export default AppointmentDetailModal;
