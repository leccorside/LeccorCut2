// Fase 2.3 — após a auto-análise, lista quais funções referenciam strings ligadas ao draft
// e resume funções por namespace. Uso (headless): -postScript DraftRefs.java <arquivo_saida>
// @category LeccorCut
import ghidra.app.script.GhidraScript;
import ghidra.program.model.data.StringDataInstance;
import ghidra.program.model.listing.*;
import ghidra.program.model.symbol.*;
import java.io.PrintWriter;
import java.util.*;

public class DraftRefs extends GhidraScript {
    private static final String[] TERMS = {
        "draft_content", "draft_info", "draft_meta_info", "attachment_", "template.tmp", "draft_settings",
        "timeline_layout", "project.json", "encrypt", "decrypt", "AES", "Crypto", "version", "new_version",
        "materials", "tracks", "segments", "canvas_config", "keyframe", "migration"
    };

    @Override
    public void run() throws Exception {
        String out = getScriptArgs().length > 0 ? getScriptArgs()[0] : "draft_refs.txt";
        Listing listing = currentProgram.getListing();
        ReferenceManager refs = currentProgram.getReferenceManager();
        try (PrintWriter w = new PrintWriter(out, "UTF-8")) {
            FunctionManager fm = currentProgram.getFunctionManager();
            w.println("# funcoes: " + fm.getFunctionCount());
            Map<String, Integer> ns = new TreeMap<>();
            for (Function f : fm.getFunctions(true)) {
                String n = f.getParentNamespace().getName(true);
                ns.merge(n, 1, Integer::sum);
            }
            w.println("# funcoes por namespace (>=20)");
            ns.entrySet().stream().filter(e -> e.getValue() >= 20)
                .sorted((a, b) -> b.getValue() - a.getValue())
                .forEach(e -> w.println(e.getValue() + "\t" + e.getKey()));

            w.println("# strings do draft -> funcoes que as referenciam");
            DataIterator it = listing.getDefinedData(true);
            int found = 0;
            while (it.hasNext() && !monitor.isCancelled()) {
                Data d = it.next();
                if (!StringDataInstance.isString(d)) continue;
                String s = StringDataInstance.getStringDataInstance(d).getStringValue();
                if (s == null || s.length() > 200) continue;
                boolean hit = false;
                for (String t : TERMS) if (s.contains(t)) { hit = true; break; }
                if (!hit) continue;
                Set<String> fns = new TreeSet<>();
                for (Reference r : refs.getReferencesTo(d.getAddress())) {
                    Function f = getFunctionContaining(r.getFromAddress());
                    if (f != null) fns.add(f.getName(true) + "@" + f.getEntryPoint());
                }
                if (fns.isEmpty()) continue;
                found++;
                w.println("\"" + s.replace("\n", "\\n") + "\"\t" + String.join(" | ", fns));
            }
            w.println("# total strings com referencia: " + found);
        }
        println("DraftRefs gravado em " + out);
    }
}
