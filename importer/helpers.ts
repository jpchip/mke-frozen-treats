
// deno-lint-ignore no-explicit-any
export async function getJson(filePath: string): Promise<any> {
    try {
        return JSON.parse(await Deno.readTextFile(filePath));
    } catch(e) {
        console.log(filePath+': '+e.message);
    }
}

// deno-lint-ignore no-explicit-any
export async function writeJson(filePath:string, o:any) {
    await Deno.writeTextFile(filePath, JSON.stringify(o));
}