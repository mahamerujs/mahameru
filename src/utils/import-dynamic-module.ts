export async function importDynamicModule(modulePath: string) {
    return await import(modulePath)
}
