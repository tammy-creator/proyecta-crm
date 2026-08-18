const fs = require('fs');

function embedHybridAI(outputFilePath) {
    const baseFilePath = 'vapi_voice_agent_workflow_base.json';
    if (!fs.existsSync(baseFilePath)) {
        console.error(`Base file not found: ${baseFilePath}`);
        return;
    }

    const data = JSON.parse(fs.readFileSync(baseFilePath, 'utf8'));

    fs.writeFileSync(outputFilePath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`Successfully compiled clean workflow to ${outputFilePath}`);
}

embedHybridAI('vapi_voice_agent_workflow.json');
embedHybridAI('n8n/vapi_voice_agent_workflow.json');
