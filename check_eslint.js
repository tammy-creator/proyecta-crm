import reactHooks from 'eslint-plugin-react-hooks';
console.log('Configs:', Object.keys(reactHooks.configs || {}));
if (reactHooks.configs.flat) {
    console.log('Flat config keys:', Object.keys(reactHooks.configs.flat));
} else {
    console.log('No flat config object');
}
