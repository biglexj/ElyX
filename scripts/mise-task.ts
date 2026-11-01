#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const root = resolve(import.meta.dir, "..");

function readTomlVersion(path: string): string {
    const content = readFileSync(path, "utf-8");
    const m = content.match(/^version\s*=\s*"([^"]+)"/m);
    if (!m) throw new Error("No se pudo leer la versión en " + path);
    return m[1];
}

function sha256(filePath: string): string {
    const buffer = readFileSync(filePath);
    return createHash("sha256").update(buffer).digest("hex");
}

function runCmdSync(cmd: string[], cwd = root): { stdout: string; stderr: string; code: number } {
    const res = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
    return {
        stdout: res.stdout.toString().trim(),
        stderr: res.stderr.toString().trim(),
        code: res.exitCode ?? 0,
    };
}

const appVersion = readTomlVersion(join(root, "pyproject.toml"));
const appName = "ElyX";
const repository = "biglexj/ElyX";

const help = `ElyX: mise <dev|build|release|publish> [opciones]
  dev      Ejecutar pruebas unitarias o CLI en modo desarrollo.
  build    Compilar y verificar sintaxis de código fuente Python.
  release  Generar distribuibles locales (wheel y sdist en dist/).
  publish  [github] Publicar release en GitHub.
  --plan   Mostrar los comandos o el plan sin ejecutar acciones ni escribir.
  --check  Para publish: verificar requisitos locales y remotos sin escribir.

Ejemplos:
  mise dev
  mise dev --plan
  mise build --plan
  mise release --plan
  mise publish --plan
  mise publish --check
`;

async function handlePublish(args: string[]): Promise<number> {
    const isPlan = args.includes("--plan");
    const isCheck = args.includes("--check");
    const positional = args.filter((arg) => !arg.startsWith("-"));
    const channel = positional[0] ?? "github";

    if (channel !== "github") {
        throw new Error(`Canal desconocido: ${channel}. ElyX es una biblioteca experimental publicada únicamente en GitHub.`);
    }

    console.log(`\n=== Publicación: ${appName} v${appVersion} ===`);
    console.log(`Repositorio : ${repository}`);
    console.log(`Canales     : GitHub Releases (Biblioteca/Códec experimental)`);

    if (isPlan) {
        console.log("\n[Plan de publicación]");
        console.log("1. Verificar que el repositorio esté en rama main limpia y commit en remoto.");
        console.log(`2. Comprobar paquetes locales en dist/: elyx-${appVersion}-py3-none-any.whl o tar.gz.`);
        console.log("3. Validar notas de versión.");
        console.log(`4. Crear tag git v${appVersion} y GitHub Release vía gh.`);
        console.log("\n(--plan completado: no se realizaron cambios ni consultas de red)");
        return 0;
    }

    if (isCheck) {
        console.log("\n[Comprobación de preparación (--check)]");
        let hasErrors = false;

        // 1. Git status
        const gitStatus = runCmdSync(["git", "status", "--porcelain"]);
        if (gitStatus.stdout) {
            console.warn("⚠️  Aviso: El repositorio tiene cambios locales sin confirmar.");
        } else {
            console.log("✅ Árbol Git limpio.");
        }

        // 2. Git tag
        const tagCheck = runCmdSync(["git", "tag", "-l", `v${appVersion}`]);
        if (tagCheck.stdout.includes(`v${appVersion}`)) {
            console.warn(`⚠️  El tag v${appVersion} ya existe localmente.`);
        } else {
            console.log(`✅ Tag v${appVersion} libre localmente.`);
        }

        // 3. Artefactos en dist/
        const distDir = join(root, "dist");
        let foundDist: string[] = [];
        if (existsSync(distDir)) {
            foundDist = readdirSync(distDir).filter((f) => f.includes(appVersion));
        }

        if (foundDist.length > 0) {
            console.log(`✅ Distribuibles presentes en dist/: ${foundDist.join(", ")}`);
            for (const f of foundDist) {
                const fullPath = join(distDir, f);
                console.log(`   ${f} -> SHA-256: ${sha256(fullPath)}`);
            }
        } else {
            console.warn(`❌ No se encontraron distribuibles en dist/ para v${appVersion}. Ejecuta 'mise release' antes de publicar.`);
            hasErrors = true;
        }

        console.log("\n(--check completado: modo solo lectura sin escrituras)");
        return hasErrors ? 1 : 0;
    }

    console.error("\n❌ Publicación bloqueada: Requiere confirmación y autorización explícita para publicar en producción.");
    console.error("   Usa --plan para revisar los pasos previstos o --check para verificar el estado de los artefactos.");
    return 1;
}

export async function main(args = Bun.argv.slice(2)): Promise<number> {
    const [action, ...rest] = args;
    if (!action || action === "--help" || rest.includes("--help")) {
        console.log(help);
        return 0;
    }

    if (action === "publish") {
        return handlePublish(rest);
    }

    const isPlan = rest.includes("--plan");

    if (action === "dev") {
        const cmd = ["py", "-3", "-m", "pytest"];
        console.log(`dev ${appName}\nDirectorio: ${root}\nComando: ${cmd.join(" ")}`);
        if (isPlan) return 0;
        const child = Bun.spawn(cmd, { cwd: root, stdin: "inherit", stdout: "inherit", stderr: "inherit" });
        return (await child.exited) ?? 0;
    }

    if (action === "build") {
        const cmd = ["py", "-3", "-m", "compileall", "-q", "src", "tests"];
        console.log(`build ${appName}\nDirectorio: ${root}\nComando: ${cmd.join(" ")}`);
        if (isPlan) return 0;

        console.log("\n==> Compilando y verificando sintaxis de código Python...");
        const child = Bun.spawn(cmd, { cwd: root, stdin: "inherit", stdout: "inherit", stderr: "inherit" });
        return (await child.exited) ?? 0;
    }

    if (action === "release") {
        const cmd = ["py", "-3", "-m", "build", "--sdist", "--wheel", "--outdir", "dist"];
        console.log(`release ${appName}\nDirectorio: ${root}\nComando: ${cmd.join(" ")}`);
        if (isPlan) return 0;

        const child = Bun.spawn(cmd, { cwd: root, stdin: "inherit", stdout: "inherit", stderr: "inherit" });
        return (await child.exited) ?? 0;
    }

    throw new Error(`Acción desconocida: ${action}. Usa mise dev, mise build, mise release o mise publish.`);
}

if (import.meta.main) {
    const args = process.env.MISE_TASK_NAME
        ? [process.env.MISE_TASK_NAME, ...Bun.argv.slice(2)]
        : Bun.argv.slice(2);
    try {
        process.exit(await main(args));
    } catch (err: any) {
        console.error(err?.message ?? err);
        process.exit(1);
    }
}
