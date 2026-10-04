export { createGameStore } from './create_game_store';
export { localStorageAdapter, indexedDbAdapter } from './persistence';
export { getGameStore, listGameStores, clearGameStores, resetStores, isProvisionalStore } from './store_registry';
export { storeOf } from './store_of';
export { applyStoreDocs, parseStoreDoc, defaultStoreFieldValue, emptyStoreDoc, serializeStoreDoc, storeFieldsFromState, STORE_FORMAT, STORE_VERSION } from './document';
export type { TStoreDoc, TStoreField, TStoreFieldType, TStoreFieldValue, TStorePersistDoc } from './document';

export type {
    TGameStore,
    TGameStoreConfig,
    TStoreActionsFactory,
    TStoreGet,
    TStoreListener,
    TStoreSelector,
    TStoreSet,
} from './types/t_game_store';
export type { TStorePersistence, TStorePersist } from './persistence';
