import { $query, $update, Record, StableBTreeMap, Vec, match, Result, nat64, ic, Opt, Principal } from 'azle';
import { v4 as uuidv4 } from 'uuid';

type Family = Record<{
    id: string;
    admin: Principal;
    name: string; // * The family name
    members: Vec<string>; // * Names of the family members, e.g., George
    address: string; // * The address of the property where they live
    createdBy: Principal; // * Add the creator's principal
    createdAt: nat64;
    updatedAt: Opt<nat64>;
}>

type FamilyPayload = Record <{
    name: string;
    members: Vec<string>;
    address: string;
}>

type FamilyExpense = Record<{
    id: string;
    familyId: string;
    amount: string;
    attachmentURL: string; // * Picture of a receipt
    createdAt: nat64;
}>

type FamilyExpensePayload = Record<{
    familyId: string;
    amount: string;
    attachmentURL: string;
}>

const familyStorage = new StableBTreeMap<string, Family>(0, 44, 1024);
const familyExpensesStorage = new StableBTreeMap<string, FamilyExpense>(1, 44, 1024);

// dfx canister call family_expense addFamily '(record {"name"= "Smith"; "members"= vec { "John"; "Jane"; "Chris"; "Kerry" }; "address"= "153 Linkoln St., DC, Washington"})'
// dfx canister call family_expense addFamily '(record {"name"= "Wilson"; "members"= vec { "Alexander"; "Angelina"; "Mike"; "Katty" }; "address"= "810 Pleasant St., Illinois, Chicago"})'
// dfx canister call family_expense getFamily '("abf10d57-3be8-4c0a-9c6d-f93e98cd9f08")'
// dfx canister call family_expense getFamilies '()'
// dfx canister call family_expense addFamilyExpense '(record {"familyId"= "f88a5706-ec6b-45e4-9fa3-3ab7c8dc2e65"; "amount"= "105.60"; "attachmentURL"= "url/path/to/some/photo/attachment"})'
// dfx canister call family_expense addFamilyExpense '(record {"familyId"= "abf10d57-3be8-4c0a-9c6d-f93e98cd9f08"; "amount"= "255.15"; "attachmentURL"= "url/path/to/some/photo/attachment"})'
// dfx canister call family_expense addFamilyExpense '(record {"familyId"= "f8c246f8-6167-4800-a921-72b169ec3589"; "amount"= "55.25"; "attachmentURL"= "url/path/to/some/photo/attachment"})'
// dfx canister call family_expense getFamilyExpenses '("4f70de76-380e-43e1-b6cd-d969ec17a9f8")'
// dfx canister call family_expense deleteFamily '("0eb5588c-aa66-416d-8a0c-0daca3ba3c3d")'
// dfx canister call family_expense deleteFamilyExpense '("abf10d57-3be8-4c0a-9c6d-f93e98cd9f08")'

$query;
export function getFamilies(): Result<Vec<Family>, string> {
    return Result.Ok(familyStorage.values());
}

$query;
export function getFamily(id: string): Result<Family, string> {
    return match(familyStorage.get(id), {
        Some: (family) => Result.Ok<Family, string>(family),
        None: () => Result.Err<Family, string>(`Family with id=${id} not found.`)
    });
}

$query;
export function getFamilyExpenses(familyId: string): Result<Vec<FamilyExpense>, string> {
    return Result.Ok(familyExpensesStorage.values().filter(familyExpense => familyExpense.familyId === familyId));
}

$update;
export function addFamily(payload: FamilyPayload): Result<Family, string> {
    const family: Family = { id: uuidv4(), admin: ic.caller(), createdBy: ic.caller(), createdAt: ic.time(), updatedAt: Opt.None, ...payload };
    familyStorage.insert(family.id, family);
    return Result.Ok(family);
}

$update;
export function updateFamily(id: string, payload: FamilyPayload): Result<Family, string> {
    return match(familyStorage.get(id), {
        Some: (family) => {
            if (family.admin.toString() !== ic.caller().toString()) {
                return Result.Err<Family,string>(`Caller isn't the admin of the family with id ${id}.`);
            }
            const updatedFamily: Family = {...family, ...payload, updatedAt: Opt.Some(ic.time())};
            familyStorage.insert(family.id, updatedFamily);
            return Result.Ok<Family, string>(updatedFamily);
        },
        None: () => Result.Err<Family, string>(`Couldn't update a family with id=${id}. Family not found.`)
    });
}

$update;
export function addFamilyExpense(payload: FamilyExpensePayload): Result<FamilyExpense, string> {
    const family = familyStorage.get(payload.familyId)
    if (!family.Some) {
        return Result.Err(`Family with id=${payload.familyId} not found.`);
    }
    if (family.Some.admin.toString() !== ic.caller().toString()) {
        return Result.Err(`Caller isn't the admin of the family with id ${payload.familyId}.`);
    }

    const familyExpense: FamilyExpense = { id: uuidv4(), createdAt: ic.time(), ...payload };
    familyExpensesStorage.insert(familyExpense.id, familyExpense);
    return Result.Ok(familyExpense);
}

$update;
export function deleteFamily(id: string): Result<Family, string> {
    return match(familyStorage.get(id), {
        Some: (family) => {
            if (family.admin.toString() !== ic.caller().toString()) {
                return Result.Err<Family,string>(`Caller isn't the admin of the family with id ${id}.`);
            }
            familyStorage.remove(id)
            return Result.Ok<Family, string>(family)
        },
        None: () => Result.Err<Family, string>(`Couldn't delete a family with id=${id}. Family not found.`)
    });
}

$update;
export function deleteFamilyExpense(id: string): Result<FamilyExpense, string> {
    return match(familyExpensesStorage.get(id), {
        Some: (familyExpense) => {
            const family = familyStorage.get(familyExpense.familyId)
            if (!family.Some) {
                familyExpensesStorage.remove(id);
                return Result.Err<FamilyExpense, string>(`Deleted family expense with id=${familyExpense.id} as no family with id=${familyExpense.familyId} exists.`)
            }
            if (family.Some.admin.toString() !== ic.caller().toString()) {
                return Result.Err<FamilyExpense,string>(`Caller isn't the admin of the family with id ${familyExpense.familyId}.`);
            }
            familyExpensesStorage.remove(id)
            return Result.Ok<FamilyExpense, string>(familyExpense)
        },
        None: () => Result.Err<FamilyExpense, string>(`Couldn't delete a family expense with id=${id}. It has not been found.`)
    });
}

// A workaround to make uuid package work with Azle
globalThis.crypto = {
    // @ts-ignore
   getRandomValues: () => {
    let array = new Uint8Array(32)

    for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256)
    }

    return array
   }
}