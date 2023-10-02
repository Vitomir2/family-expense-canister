import { $query, $update, Record, StableBTreeMap, Vec, match, Result, nat64, ic, Opt, Principal, float64 } from 'azle';
import { v4 as uuidv4 } from 'uuid';

type Family = Record<{
    id: string;
    admin: Principal; // * Admin which is the creator of the family
    name: string; // * The family name
    members: Vec<string>; // * Names of the family members, e.g., George
    address: string; // * The address of the property where they live
    totalIncome: float64; // * Total accumulated income of the family
    createdAt: nat64;
    updatedAt: Opt<nat64>;
}>

type FamilyPayload = Record <{
    name: string;
    members: Vec<string>;
    address: string;
    income: float64;
}>

type FamilyExpense = Record<{
    id: string;
    familyId: string;
    amount: float64;
    attachmentURL: string; // * Picture of a receipt
    createdAt: nat64;
}>

type FamilyExpensePayload = Record<{
    familyId: string;
    amount: float64;
    attachmentURL: string;
}>

const familyStorage = new StableBTreeMap<string, Family>(0, 44, 1024);
const familyExpensesStorage = new StableBTreeMap<string, FamilyExpense>(1, 44, 1024);

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

$query;
export function getNetFamilyIncome(familyId: string): Result<float64, string> {
    const family = match(familyStorage.get(familyId), {
        Some: (family) => {
            return Result.Ok(family);
        },
        None: () => Result.Err<Family, string>(`Couldn't find family with id ${familyId}.`)
    });

    if (family.Err || !family.Ok) return Result.Err<float64, string>('Family not found.');

    const familyExpenses = familyExpensesStorage.values().filter(familyExpense => familyExpense.familyId === familyId);
    let netIncome = family.Ok.totalIncome
    familyExpenses.forEach(familyExpense => {
        netIncome -= familyExpense.amount
    });

    return Result.Ok<float64, string>(netIncome);
}

$update;
export function addFamily(payload: FamilyPayload): Result<Family, string> {
    const family: Family = { id: uuidv4(), admin: ic.caller(), createdAt: ic.time(), updatedAt: Opt.None, totalIncome: payload.income, ...payload };
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

            const updatedFamily: Family = {...family, ...payload, totalIncome: payload.income, updatedAt: Opt.Some(ic.time())};

            familyStorage.insert(family.id, updatedFamily);
            return Result.Ok<Family, string>(updatedFamily);
        },
        None: () => Result.Err<Family, string>(`Couldn't update a family with id=${id}. Family not found.`)
    });
}

$update;
export function updateFamilyIncome(id: string, income: float64): Result<Family, string> {
    return match(familyStorage.get(id), {
        Some: (family) => {
            if (family.admin.toString() !== ic.caller().toString()) {
                return Result.Err<Family,string>(`Caller isn't the admin of the family with id ${id}.`);
            }

            const updatedFamily: Family = {...family, updatedAt: Opt.Some(ic.time())};

            // * update the total income by increasing it with the current input
            updatedFamily.totalIncome += income

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