import "frida-il2cpp-bridge";

Il2Cpp.perform(() => {
    const asm = Il2Cpp.domain.assembly("umamusume");
    if (!asm) return console.error("Assembly 'umamusume' not found");

    const utils = asm.image.classes.find(c => c.name === "SingleModeUtils");
    const main = utils?.methods.find(m => m.name === "CalcRelationPoint" && m.parameterCount === 3);
    
    if (!main) return console.error("[-] SingleModeUtils.CalcRelationPoint not found");

    const lambdas: NativePointer[] = [];
    for (const k of asm.image.classes) {
        try {
            for (const m of k.methods) {
                if (m.returnType.name === "System.Int32" &&
                    m.name.includes("b__") &&
                    (m.name.includes("<CalcRelationPoint") || m.name.includes("<CalcRelation"))) {
                    if (!m.virtualAddress.isNull()) lambdas.push(m.virtualAddress);
                }
            }
        } catch (_) {}
    }

    const unique = [...new Set(lambdas.map(p => p.toString()))].map(s => ptr(s));
    const state = { depth: 0, parts: [] as number[] };

    for (const addr of unique) {
        Interceptor.attach(addr, {
            onLeave(retval) {
                if (state.depth > 0) state.parts.push(retval.toInt32());
            }
        });
    }

    Interceptor.attach(main.virtualAddress, {
        onEnter() {
            state.depth++;
            state.parts = [];
        },
        onLeave(retval) {
            const total = retval.toInt32();
            const base = state.parts.reduce((a, b) => a + b, 0);
            console.log(`[Relation] Total: ${total} | Base: ${base} | RaceBonus: ${total - base}`);
            state.depth--;
        }
    });

    console.log(`Hooked SingleModeUtils.CalcRelationPoint & ${unique.length} lambdas.`);
});