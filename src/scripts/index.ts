export {
    registerScript, clearScripts, listScripts,
    getScriptFields, getScriptRequires, defaultScriptProps,
} from './script_registry';

export type {
    TScriptFn, TScriptProps, TScriptField, TScriptOptions, TScriptRequirement, TScriptAttachment,
} from './types/t_script';
