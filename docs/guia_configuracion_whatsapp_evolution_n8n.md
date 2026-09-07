# 📱 Guía de Automatización: Recordatorios de Citas por WhatsApp (Evolution API + n8n)

Esta guía detalla la configuración y puesta en marcha del workflow automático de recordatorios de citas para **Centro Proyecta**, integrado con **Evolution API**, **Supabase CRM** y cumplimiento **RGPD**.

---

## 🎯 Objetivo y Comportamiento del Flujo

1. **Horario de Ejecución**: Todos los días laborables (de **Lunes a Viernes a las 10:00 AM**, hora peninsular española `Europe/Madrid`).
2. **Lógica de Fechas Inteligente**:
   - De **Lunes a Jueves**: Revisa y envía las citas del **día siguiente** (Martes a Viernes).
   - Los **Viernes a las 10:00 AM**: Revisa y envía las citas del **fin de semana y del Lunes completo**, evitando enviar recordatorios los domingos.
3. **Control Opt-In / Opt-Out por Paciente**:
   - Cada ficha de paciente cuenta con un interruptor **"Recordatorios de Citas por WhatsApp"** (activo por defecto).
   - Si un paciente tiene sesiones recurrentes múltiples y prefiere no recibir avisos, se desactiva en su ficha y el flujo lo omite automáticamente.
4. **Cumplimiento RGPD (Cláusula Legal Informativa)**:
   - La **primera vez** que el sistema envía un mensaje a un paciente/familia, envía primero el texto legal de protección de datos solicitado por la empresa RGPD.
   - Una vez entregado, marca `whatsapp_rgpd_enviado = true` en Supabase y **nunca más** vuelve a enviar dicha cláusula a ese paciente.
5. **Canal Unidireccional con Enlace Directo a Recepción**:
   - Mensaje cariñoso y cercano orientado a familias (`¡Hola familia! 👋🌟`).
   - Disclaimer de que el bot no recibe respuestas directas.
   - Enlace directo, corto y limpio a la recepción del centro: `https://wa.me/34684653227 (Recepción: 684 653 227)`.
6. **Seguridad Anti-Baneo**:
   - Pausa de seguridad de 3 segundos entre pacientes para proteger la línea de WhatsApp.
7. **Trazabilidad y Alertas**:
   - Marca en Supabase la cita como `notificacion_recordatorio_enviada = true`.
   - Solo genera alerta en el CRM si ocurre un error real de entrega o si el paciente no tiene teléfono.

---

## 📋 Variables en el nodo `Set Workflow Config`

| Variable | Descripción | Ejemplo / Valor |
| :--- | :--- | :--- |
| `evolution_base_url` | URL de tu servidor Evolution API | `https://whatsapp.centroproyecta.es` |
| `evolution_instance` | Nombre de la instancia conectada | `proyecta` |
| `evolution_apikey` | Clave API de Evolution API | *(Tu clave del panel de Evolution)* |
| `center_contact_phone` | Teléfono de WhatsApp de recepción | `34684653227` |
| `supabase_url` | URL del proyecto Supabase | `https://rmohexwayuazhoiocrcn.supabase.co` |
| `supabase_key` | Clave Supabase (anon / service) | `sb_publishable_...` |
| `test_mode` | Modo de prueba seguro (`true` / `false`) | `false` en producción |
| `test_date_override` | Fecha objetivo para pruebas | `2026-09-05` |
| `test_phone_override` | Redirige todos los envíos a este número | *(Tu móvil para probar)* |

---

## 📄 Mensajes Enviados

### 1. Mensaje de Cláusula RGPD (Únicamente en el 1º contacto)
```text
*Centro Infantil Proyecta, S.L. - Información de Protección de Datos*

Le informamos de que los datos personales facilitados en esta conversación serán tratados por Centro Infantil Proyecta, S.L. con la finalidad de atender sus consultas y gestionar las comunicaciones relacionadas con sus citas, incluido el envío de avisos y recordatorios.

Asimismo, puede ejercer sus derechos enviando un email a: centroproyectagijon@gmail.com, identificándose adecuadamente.

Para más información sobre el tratamiento de sus datos o sus derechos, puede consultar nuestra política de privacidad: https://centroproyecta.es/politica-de-privacidad
```

### 2. Mensaje de Recordatorio de Cita
```text
¡Hola familia! 👋🌟

Te escribimos desde *Centro Proyecta* para recordarte la próxima cita de *Mateo*:

📅 *Fecha:* Lunes, 7 de septiembre
⏰ *Hora:* 10:00 h
👩‍⚕️ *Especialista:* Ruth
🧩 *Servicio:* Logopedia
📍 *Lugar:* Centro Proyecta

ℹ️ _Este es un canal de notificaciones automáticas y no recibe respuestas directas._

Si necesitas modificar tu cita o no puedes asistir, por favor contáctanos por WhatsApp pulsando aquí:
👉 https://wa.me/34684653227 (Recepción: 684 653 227)

¡Muchas gracias y nos vemos pronto! 😊✨
```

---

## 🗄️ Migración SQL en Supabase

Ejecuta el script [supabase/migrations/20260907100000_add_patient_whatsapp_preferences.sql](../supabase/migrations/20260907100000_add_patient_whatsapp_preferences.sql) en el SQL Editor de Supabase:

```sql
ALTER TABLE public.patients
ADD COLUMN IF NOT EXISTS recibir_recordatorios_whatsapp BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS whatsapp_rgpd_enviado BOOLEAN DEFAULT FALSE;

UPDATE public.patients 
SET recibir_recordatorios_whatsapp = TRUE 
WHERE recibir_recordatorios_whatsapp IS NULL;

UPDATE public.patients 
SET whatsapp_rgpd_enviado = FALSE 
WHERE whatsapp_rgpd_enviado IS NULL;
```

---

## 🚀 Puesta en Producción en n8n

1. En n8n, importa o reemplaza el workflow con el archivo `n8n/whatsapp_appointment_reminders_workflow.json`.
2. Abre el nodo **Set Workflow Config** y configura:
   - `test_mode`: `false`
   - `test_date_override`: `""`
   - `test_phone_override`: `""`
3. En la esquina superior derecha de n8n, activa el interruptor (**Active / Inactive** -> **Active**).
4. ¡Listo! A partir de ese momento, el workflow se ejecutará puntualmente de lunes a viernes a las 10:00 AM.
