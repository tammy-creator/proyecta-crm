const fs = require('fs');

function embedHybridAI(filePath) {
    if (!fs.existsSync(filePath)) {
        console.log(`File not found: ${filePath}`);
        return;
    }
    let content = fs.readFileSync(filePath, 'utf8');
    let data = JSON.parse(content);

    // Read knowledge base
    const kbContent = fs.readFileSync('vapi_clara_knowledge_base.md', 'utf8');

    // Helper to make an OpenAI completion HTTP request node config
    function makeOpenAINode(name, systemPrompt, userPrompt, position) {
        return {
            "parameters": {
                "method": "POST",
                "url": "https://api.openai.com/v1/chat/completions",
                "sendHeaders": true,
                "headerParameters": {
                    "parameters": [
                        {
                            "name": "Content-Type",
                            "value": "application/json"
                        },
                        {
                            "name": "Authorization",
                            "value": "=Bearer {{ $('Vapi Webhook').first().json.headers['x-openai-key'] || $env.OPENAI_API_KEY || 'REPLACE_WITH_YOUR_OPENAI_KEY-XA03AbgJiFNCCjQyFGJZyWkB-oNEERa-xtDkbMCjQkwc2LVyBNw5H8UT3BlbkFJ0vgylvWwiYQDtKnxirGbYHiKQWidTeWLZJzRejc8vP49NUZna6J5yF0f88_WdgH_3CftjoxcUIA' }}"
                        }
                    ]
                },
                "sendBody": true,
                "specifyBody": "json",
                "jsonBody": JSON.stringify({
                    "model": "gpt-4o-mini",
                    "messages": [
                        {
                            "role": "system",
                            "content": systemPrompt
                        },
                        {
                            "role": "user",
                            "content": userPrompt
                        }
                    ],
                    "temperature": 0.4
                })
            },
            "id": name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
            "name": name,
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.1,
            "position": position
        };
    }

    // 1. Remove Respond Saludo node from nodes
    data.nodes = data.nodes.filter(n => n.name !== 'Respond Saludo');

    // Remove corresponding connections
    delete data.connections['Check Registration Status'];
    delete data.connections['Respond Saludo'];

    // 2. Define the new nodes to be added
    const newNodes = [
        // Condition node to branch Registered vs Anonymous greetings
        {
            "parameters": {
                "conditions": {
                    "boolean": [
                        {
                            "value1": "={{ $json.registrado }}",
                            "value2": true
                        }
                    ]
                }
            },
            "id": "if-is-registered",
            "name": "Is Registered?",
            "type": "n8n-nodes-base.if",
            "typeVersion": 1,
            "position": [1720, 80]
        },
        // New Webhook responders for greeting
        {
            "parameters": {
                "respondWith": "json",
                "responseBody": "={\n  \"registrado\": true,\n  \"reply\": \"{{ $json.choices[0].message.content }}\"\n}",
                "options": {}
            },
            "id": "webhook-response-saludo-registrado",
            "name": "Respond Saludo Registrado",
            "type": "n8n-nodes-base.respondToWebhook",
            "typeVersion": 1,
            "position": [2180, 0]
        },
        {
            "parameters": {
                "respondWith": "json",
                "responseBody": "={\n  \"registrado\": false,\n  \"reply\": \"Hola, gracias por llamar al Centro Proyecta. Soy Clara, ¿en qué os puedo ayudar hoy?\"\n}",
                "options": {}
            },
            "id": "webhook-response-saludo-anonimo",
            "name": "Respond Saludo Anonimo",
            "type": "n8n-nodes-base.respondToWebhook",
            "typeVersion": 1,
            "position": [1950, 160]
        },
        // Webhook responder for general info faq
        {
            "parameters": {
                "respondWith": "json",
                "responseBody": "={\n  \"reply\": \"{{ $json.choices[0].message.content }}\"\n}",
                "options": {}
            },
            "id": "webhook-response-info-general",
            "name": "Respond Informacion General",
            "type": "n8n-nodes-base.respondToWebhook",
            "typeVersion": 1,
            "position": [1500, 360]
        },
        // Node 1: Greeting Generator
        makeOpenAINode(
            "OpenAI Greeting Generator",
            "Eres Clara, la recepcionista por voz del Centro Proyecta en Gijón. Escribe un saludo de bienvenida muy cálido, paciente y breve para la familia de un paciente que acaba de llamar. Dirígete a ellos en segunda persona del plural y menciona el nombre del niño/a paciente ({{ $json.nombre_niño }}). Mantén el saludo súper corto, de máximo 15 palabras y haz una pregunta amigable.\n\n⚠️ NORMAS IMPORTANTES:\n- HORA EN ESPAÑA: {{ $now.setZone('Europe/Madrid').format('HH:mm') }}. Adapta tu saludo según esta hora: di 'buenos días' si es antes de las 14:00, di 'buenas tardes' si es entre las 14:00 y las 20:30, y 'buenas noches' en cualquier otra hora.\n- Escribe una sola frase de saludo amigable, corta y directa. Máximo 15 palabras.\n- NUNCA uses listas, viñetas ni guiones.",
            "Paciente: {{ $json.nombre_niño }} {{ $json.apellidos }}.",
            [1955, 0]
        ),
        // Node 2: Availability confirmation
        makeOpenAINode(
            "OpenAI Availability Responder",
            "Eres Clara, la recepcionista por voz del Centro Proyecta. Confirma de manera muy empática, natural y breve al usuario que has tomado nota de su solicitud de horario/disponibilidad para recepción. Explícales que mis compañeras de administración revisarán la agenda física y les llamarán o enviarán un mensaje hoy mismo para confirmarle el hueco definitivo. Escribe solo lo que vas a decir, máximo 2 frases, sin sonar robótica o mecánica. Evita explicaciones técnicas.",
            "Datos de la solicitud:\n- Niño/Paciente: {{ $('Bypass Sec Vapi').first().json.body.message?.toolCalls?.[0]?.function?.args?.nombre_niño || 'el niño' }}\n- Terapeuta solicitado: {{ $('Bypass Sec Vapi').first().json.body.message?.toolCalls?.[0]?.function?.args?.terapeuta || 'cualquiera disponible' }}\n- Horario deseado: {{ $('Bypass Sec Vapi').first().json.body.message?.toolCalls?.[0]?.function?.args?.preferencia_horaria || 'las tardes' }}\n- Notas/Motivo: {{ $('Bypass Sec Vapi').first().json.body.message?.toolCalls?.[0]?.function?.args?.motivo || 'petición de cita' }}",
            [850, 240]
        ),
        // Node 3: Booking/Reserve confirmation
        makeOpenAINode(
            "OpenAI Booking Responder",
            "Eres Clara, la recepcionista por voz de Centro Proyecta. Confirma de forma muy atenta, empática y breve al usuario que ya has registrado su solicitud de reserva en el sistema. Explícales que el equipo de administración revisará la disponibilidad de la agenda física hoy mismo y se pondrá en contacto con ellos para confirmar la cita de forma definitiva. Escribe máximo 2 frases conversacionales.",
            "Datos de la reserva:\n- Niño/Paciente: {{ $('Bypass Sec Vapi').first().json.body.message?.toolCalls?.[0]?.function?.args?.nombre_niño || 'el niño' }}\n- Terapeuta: {{ $('Bypass Sec Vapi').first().json.body.message?.toolCalls?.[0]?.function?.args?.terapeuta || 'cualquiera' }}\n- Día/Hora solicitado: {{ $('Bypass Sec Vapi').first().json.body.message?.toolCalls?.[0]?.function?.args?.fecha_hora || 'el día solicitado' }}\n- Motivo: {{ $('Bypass Sec Vapi').first().json.body.message?.toolCalls?.[0]?.function?.args?.motivo || 'no especificado' }}",
            [1000, 400]
        ),
        // Node 4: Cancellation confirmation
        makeOpenAINode(
            "OpenAI Cancellation Responder",
            "Eres Clara, la recepcionista por voz de Centro Proyecta. Confirma al usuario de forma muy atenta, empática y comprensiva que has recibido su aviso de cancelación y que lo has registrado en el sistema. Dile que no es necesario que asistan a esa sesión y que el personal de recepción validará la cancelación física hoy mismo y les llamará o enviará un WhatsApp de confirmación. Máximo 2 frases de longitud regular.",
            "Datos de la cancelación:\n- Niño/Paciente: {{ $('Bypass Sec Vapi').first().json.body.message?.toolCalls?.[0]?.function?.args?.nombre_niño || 'el niño' }}\n- Terapeuta: {{ $('Bypass Sec Vapi').first().json.body.message?.toolCalls?.[0]?.function?.args?.terapeuta || 'la terapeuta' }}\n- Cita a cancelar: {{ $('Bypass Sec Vapi').first().json.body.message?.toolCalls?.[0]?.function?.args?.fecha_hora || 'la cita indicada' }}\n- Motivo informado: {{ $('Bypass Sec Vapi').first().json.body.message?.toolCalls?.[0]?.function?.args?.motivo || 'aviso de cancelación' }}",
            [1150, 560]
        ),
        // Node 5: General FAQ / Information Responder
        makeOpenAINode(
            "OpenAI FAQ Responder",
            "Eres Clara, la recepcionista por voz del Centro Proyecta de Gijón (Centro de Desarrollo Cognitivo). Tu tono es muy empático, pausado, amigable y sumamente conversacional. Responde a la pregunta del usuario utilizando de forma exacta y coherente la base de conocimiento provista.\n\n⚠️ NORMAS IMPORTANTES:\n- Escribe la respuesta de forma conversacional lista para ser leída por voz. Máximo 2 a 3 oraciones cortas. No uses lenguaje robótico.\n- NUNCA uses listas, viñetas ni guiones.\n- NUNCA menciones precios ni tarifas por propia iniciativa (primero explica la metodología e información); dales la información sobre el proceso y si te preguntan el precio directamente, entonces se los indicas (70€ la primera entrevista/valoración, etc).\n- Si te preguntan por psicomotricidad o fisioterapia, di que no ofrecemos esos servicios en el centro de forma directa, pero sí logopedia, psicología, psicopedagogía y terapia ocupacional (integración sensorial).\n- **CIERRE CONVERSACIONAL:** Al final de tu respuesta de información, no pidas datos de contacto directamente. En su lugar, invita de forma empática al usuario a plantear más dudas o a compartir las inquietudes/dificultades específicas del niño/a para orientarle mejor (ejemplo: '¿Te queda alguna duda sobre esto, o prefieres contarme un poco qué dificultad está teniendo el peque para ver cómo os podemos orientar?').\n\n### BASE DE CONOCIMIENTO DE CENTRO PROYECTA:\n" + kbContent,
            "Pregunta del usuario:\n{{ $('Bypass Sec Vapi').first().json.body.message?.toolCalls?.[0]?.function?.args?.pregunta || $('Bypass Sec Vapi').first().json.body.message?.toolCalls?.[0]?.function?.args?.motivo || 'petición de información de servicios' }}",
            [1280, 360]
        )
    ];

    data.nodes.push(...newNodes);

    // 3. Update Switch Acciones parameter rules and output count
    const switchNode = data.nodes.find(n => n.name === 'Switch Acciones');
    if (switchNode) {
        switchNode.parameters.numberOutputs = 5;
        // Add rule for informacion_general
        const existingRule = switchNode.parameters.rules.rules.find(r => r.value2 === 'informacion_general');
        if (!existingRule) {
            switchNode.parameters.rules.rules.push({
                "value2": "informacion_general",
                "output": 4
            });
        }
    }

    // 4. Clean up Respond node values to receive AI output
    const respAvail = data.nodes.find(n => n.name === 'Respond Disponibilidad');
    if (respAvail) {
        respAvail.parameters.responseBody = "={\n  \"reply\": \"{{ $json.choices[0].message.content }}\"\n}";
    }
    const respConfirm = data.nodes.find(n => n.name === 'Respond Confirmacion');
    if (respConfirm) {
        respConfirm.parameters.responseBody = "={\n  \"reply\": \"{{ $json.choices[0].message.content }}\"\n}";
    }
    const respCancel = data.nodes.find(n => n.name === 'Respond Cancelacion');
    if (respCancel) {
        respCancel.parameters.responseBody = "={\n  \"reply\": \"{{ $json.choices[0].message.content }}\"\n}";
    }

    // 5. Connect all the new nodes
    // Check Registration Status -> Is Registered?
    data.connections['Check Registration Status'] = {
        "main": [
            [
                {
                    "node": "Is Registered?",
                    "type": "main",
                    "index": 0
                }
            ]
        ]
    };

    // Is Registered? (True, output index 0) -> OpenAI Greeting Generator
    // Is Registered? (False, output index 1) -> Respond Saludo Anonimo
    data.connections['Is Registered?'] = {
        "main": [
            [
                {
                    "node": "OpenAI Greeting Generator",
                    "type": "main",
                    "index": 0
                }
            ],
            [
                {
                    "node": "Respond Saludo Anonimo",
                    "type": "main",
                    "index": 0
                }
            ]
        ]
    };

    // OpenAI Greeting Generator -> Respond Saludo Registrado
    data.connections['OpenAI Greeting Generator'] = {
        "main": [
            [
                {
                    "node": "Respond Saludo Registrado",
                    "type": "main",
                    "index": 0
                }
            ]
        ]
    };

    // Switch Acciones Outputs re-routing
    // Index 0 -> Query Patients by Phone (to get greeting logic going)
    // Index 1 -> Log Availability to Dashboard
    // Index 2 -> Log Booking Request to Dashboard
    // Index 3 -> Log Cancelation to Dashboard
    // Index 4 -> OpenAI FAQ Responder
    if (data.connections['Switch Acciones'] && data.connections['Switch Acciones'].main) {
        data.connections['Switch Acciones'].main = [
            [
                {
                    "node": "Query Patients by Phone",
                    "type": "main",
                    "index": 0
                }
            ], // Index 0 (saludo / buscar_paciente)
            [
                {
                    "node": "Log Availability to Dashboard",
                    "type": "main",
                    "index": 0
                }
            ], // Index 1
            [
                {
                    "node": "Log Booking Request to Dashboard",
                    "type": "main",
                    "index": 0
                }
            ], // Index 2
            [
                {
                    "node": "Log Cancelation to Dashboard",
                    "type": "main",
                    "index": 0
                }
            ], // Index 3
            [
                {
                    "node": "OpenAI FAQ Responder",
                    "type": "main",
                    "index": 0
                }
            ]  // Index 4 (informacion_general)
        ];
    }

    // Connect Log nodes output to OpenAI Responders
    data.connections['Log Availability to Dashboard'] = {
        "main": [
            [
                {
                    "node": "OpenAI Availability Responder",
                    "type": "main",
                    "index": 0
                }
            ]
        ]
    };
    data.connections['Log Booking Request to Dashboard'] = {
        "main": [
            [
                {
                    "node": "OpenAI Booking Responder",
                    "type": "main",
                    "index": 0
                }
            ]
        ]
    };
    data.connections['Log Cancelation to Dashboard'] = {
        "main": [
            [
                {
                    "node": "OpenAI Cancellation Responder",
                    "type": "main",
                    "index": 0
                }
            ]
        ]
    };

    // Connect OpenAI Responders to Respond Webhook nodes
    data.connections['OpenAI Availability Responder'] = {
        "main": [
            [
                {
                    "node": "Respond Disponibilidad",
                    "type": "main",
                    "index": 0
                }
            ]
        ]
    };
    data.connections['OpenAI Booking Responder'] = {
        "main": [
            [
                {
                    "node": "Respond Confirmacion",
                    "type": "main",
                    "index": 0
                }
            ]
        ]
    };
    data.connections['OpenAI Cancellation Responder'] = {
        "main": [
            [
                {
                    "node": "Respond Cancelacion",
                    "type": "main",
                    "index": 0
                }
            ]
        ]
    };
    data.connections['OpenAI FAQ Responder'] = {
        "main": [
            [
                {
                    "node": "Respond Informacion General",
                    "type": "main",
                    "index": 0
                }
            ]
        ]
    };

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`Successfully embedded OpenAI hybrid response nodes in ${filePath}`);
}

embedHybridAI('vapi_voice_agent_workflow.json');
embedHybridAI('n8n/vapi_voice_agent_workflow.json');
