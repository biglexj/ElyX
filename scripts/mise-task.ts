#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
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

// El intérprete del entorno virtual local tiene prioridad; si no existe, se usa el lanzador del sistema.
function pythonArgs(args: string[]): string[] {
    const venv = join(root, ".venv", "Scripts", "python.exe");
    return existsSync(venv) ? [venv, ...args] : ["py", "-3", ...args];
}
const repository = "biglexj/ElyX";

const help = `ElyX: mise <setup|dev|build|check|test|release|publish> [opciones]
  setup    Crear el entorno virtual .venv e instalar ElyX con sus extras de desarrollo.
  dev      Ejecutar la suite de pruebas en el bucle de desarrollo.
  build    Generar los paquetes distribuibles (wheel y sdist) en dist/.
  check    Verificar la sintaxis del código fuente y de las pruebas.
  test     Ejecutar la suite de pruebas automatizadas.
  release  Preparar los artefactos de distribución y sus sumas SHA-256 en dist/.
  publish  [github] Publicar release en GitHub.
  --plan   Mostrar los comandos o el plan sin ejecutar acciones ni escribir.
  --check  Para publish: verificar requisitos locales y remotos sin escribir.

Ejemplos:
  mise setup
  mise dev
  mise dev --plan
  mise build --plan
  mise check --plan
  mise test --plan
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

    if (action === "setup") {
        const cmdCreate = pythonArgs(["-m", "venv", join(root, ".venv")]);
        const cmdInstall = pythonArgs(["-m", "pip", "install", "-e", ".[dev]"]);
        console.log(`setup ${appName}\nDirectorio: ${root}\nComando: ${cmdCreate.join(" ")} && ${cmdInstall.join(" ")}`);
        if (isPlan) return 0;

        console.log("\n==> [1/2] Creando el entorno virtual .venv...");
        const resCreate = runCmdSync(cmdCreate);
        if (resCreate.code !== 0) {
            console.error(resCreate.stderr || resCreate.stdout);
            throw new Error(`Fallo al crear el entorno virtual (código ${resCreate.code})`);
        }
        console.log("==> [2/2] Instalando ElyX con los extras de desarrollo...");
        const resInstall = runCmdSync(cmdInstall);
        if (resInstall.code !== 0) {
            console.error(resInstall.stderr || resInstall.stdout);
            throw new Error(`Fallo al instalar las dependencias (código ${resInstall.code})`);
        }
        return 0;
    }

    if (action === "dev") {
        const cmd = pythonArgs(["-m", "pytest"]);
        console.log(`dev ${appName}\nDirectorio: ${root}\nComando: ${cmd.join(" ")}`);
        if (isPlan) return 0;
        const child = Bun.spawn(cmd, { cwd: root, stdin: "inherit", stdout: "inherit", stderr: "inherit" });
        return (await child.exited) ?? 0;
    }

    if (action === "check") {
        const cmd = pythonArgs(["-m", "compileall", "-q", "src", "tests"]);
        console.log(`check ${appName}\nDirectorio: ${root}\nComando: ${cmd.join(" ")}`);
        if (isPlan) return 0;

        console.log("\n==> Verificando la sintaxis del código Python...");
        const res = runCmdSync(cmd);
        if (res.code !== 0) {
            console.error(res.stderr || res.stdout);
            throw new Error(`Fallo en la verificación de sintaxis (código ${res.code})`);
        }
        return 0;
    }

    if (action === "test") {
        const cmd = pythonArgs(["-m", "pytest"]);
        console.log(`test ${appName}\nDirectorio: ${root}\nComando: ${cmd.join(" ")}`);
        if (isPlan) return 0;
        const child = Bun.spawn(cmd, { cwd: root, stdin: "inherit", stdout: "inherit", stderr: "inherit" });
        return (await child.exited) ?? 0;
    }

    if (action === "build") {
        const cmd = pythonArgs(["-m", "build", "--sdist", "--wheel", "--outdir", "dist"]);
        console.log(`build ${appName}\nDirectorio: ${root}\nComando: ${cmd.join(" ")}`);
        if (isPlan) return 0;

        const child = Bun.spawn(cmd, { cwd: root, stdin: "inherit", stdout: "inherit", stderr: "inherit" });
        return (await child.exited) ?? 0;
    }

    if (action === "release") {
        const cmdBuild = pythonArgs(["-m", "build", "--sdist", "--wheel", "--outdir", "dist"]);
        console.log(`release ${appName}\nDirectorio: ${root}\nComando: ${cmdBuild.join(" ")} + SHA256SUMS.txt`);
        if (isPlan) return 0;

        const child = Bun.spawn(cmdBuild, { cwd: root, stdin: "inherit", stdout: "inherit", stderr: "inherit" });
        const code = (await child.exited) ?? 0;
        if (code !== 0) return code;

        // Preparar los artefactos para su publicación: sumas SHA-256 de cada distribuible.
        const distDir = join(root, "dist");
        if (!existsSync(distDir)) {
            throw new Error("No se encontró dist/ tras la compilación.");
        }
        const artifacts = readdirSync(distDir).filter((f) => f.endsWith(".whl") || f.endsWith(".tar.gz"));
        if (artifacts.length === 0) {
            throw new Error("No se generaron distribuibles en dist/.");
        }
        const sums = artifacts.map((f) => `${sha256(join(distDir, f))}  ${f}`).join("\n") + "\n";
        writeFileSync(join(distDir, "SHA256SUMS.txt"), sums, "utf-8");
        console.log(`\n==> Artefactos preparados en dist/: ${artifacts.join(", ")}`);
        console.log("    SHA256SUMS.txt generado (la publicación remota no se ha ejecutado).");
        return 0;
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
