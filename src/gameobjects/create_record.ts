import { nanoId } from "../utils";
/**
 * Creates a new record with a unique ID.
 * @internal
 */
export const createRecord = <TType extends string, T extends object>(
    type: TType,
    data: T & { id?: string },
): { type: TType; id: string } & T => ({
    ...data,
    type,
    id: data.id ?? nanoId(),
});
