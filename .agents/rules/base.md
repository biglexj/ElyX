---
trigger: always_on
---

# Instrucciones del proyecto — ElyX

## Documentación Core — entrada compartida

Consultar primero [Documentación Core](../../../Docs/README.md) y seleccionar solo los módulos pertinentes. Los estándares compartidos se mantienen allí; este archivo conserva el alcance y los contratos específicos del proyecto.

- [Calidad y entrega proporcionales](../../../Docs/global/quality/quality-baseline.md): build para ajustes visuales pequeños; pruebas pertinentes para elementos, lógica o páginas nuevos y cambios grandes; revisión acotada para documentación.
- [Procesos según alcance](../../../Docs/global/documentation/process-workflow.md): no añadir fases, archivos ni nuevas aprobaciones por rutina a ajustes pequeños ya autorizados.
- [Diseño común](../../../Docs/global/design/design_system.md) y [textos de interfaz](../../../Docs/global/design/interface-writing.md): contenido preciso, espacio útil, mínimo scroll innecesario, conservando la identidad del producto.
- [Estilo de comunicación](../../../Docs/global/agents/communication-style.md): registro «Scientific Elegant» en resúmenes y cierres; no aplica a los textos de interfaz.
- [Reglas de trabajo del agente](../../../Docs/global/documentation/agent-working-rules.md): entrada única, límite de 12.000 caracteres por archivo de reglas y commits de resguardo.
- [Comandos mediante Mise](../../../Docs/global/architecture/mise-command-standard.md) y [scripts y alias](../../../Docs/global/architecture/command-scripts-standard.md): Mise es la interfaz de comandos; los scripts de `package.json` son implementación, no interfaz.
- [Base de lanzamientos](../../../Docs/global/releases/release-baseline.md) y [protocolo de lanzamiento](../../../Docs/global/releases/protocolo_lanzamiento_actualizacion.md): versionado, artefactos e inmutabilidad de lo publicado.
- [Base de Python](../../../Docs/stacks/python/python-baseline.md): convenciones del stack.
- [Diagnósticos reutilizables](../../../Docs/troubleshooting/README.md) y [promoción a Core](../../../Docs/global/documentation/core-promotion-workflow.md): documentar en Core los fallos confirmados o aprendizajes generalizables y enlazarlos desde el proyecto; mantener locales los detalles exclusivos.

En estos criterios comunes, aplicar las bases vigentes enlazadas en lugar de copias históricas de este archivo. Respetar la dirección actual de Biglex y los contratos específicos del producto; ante una contradicción, comprobar la implementación vigente y resolverla explícitamente. Las skills generales importadas son apoyo técnico, no una autoridad para redefinir estas reglas.

Entrada única de instrucciones: `.agents/rules/base.md`. No se crean `AGENTS.md` ni `agent.md` equivalentes en la raíz.

## Contratos locales de ElyX

- **ElyX es una biblioteca y CLI experimental de códec de imagen** (Python ≥ 3.9), construida sobre la transformada wavelet CDF 5/3 con elevación entera, decorrelación de color YCoCg-R, predicción MED y cuantización Double Dead-Zone. Estado declarado: **prototipo de investigación (v0.1), no apto para producción**.
- Alcance actual: reconstrucción sin pérdida matemática (`step=1`) hasta compresión con pérdida perceptual. **Sin** soporte de HDR, canal alfa, animación, EXIF/ICC ni profundidad superior a 8 bits.
- Licencia MIT; autoría `biglexj` (2026). El paquete se publica en GitHub Releases; la publicación en PyPI es mentioned en el README como algo pendiente de disponibilidad real.
- El contrato del códec y la especificación científica viven en [`docs/SCIENTIFIC.md`](../../docs/SCIENTIFIC.md), [`docs/USER_GUIDE.md`](../../docs/USER_GUIDE.md), [`docs/AFFINITY_BRIDGE.md`](../../docs/AFFINITY_BRIDGE.md) y [`docs/PRISMA_INTEGRATION.md`](../../docs/PRISMA_INTEGRATION.md).
- La documentación de contribución y el flujo de trabajo con el usuario están en [`CONTRIBUTING.md`](../../CONTRIBUTING.md).
- `results/` contiene las salidas de las ejecuciones de referencia y no se versiona en su totalidad; `examples/` contiene los materiales de trabajo del estudio.

## Comandos

Mise es la interfaz del proyecto: `mise setup` (entorno virtual e instalación con extras de desarrollo), `mise dev`, `mise build`, `mise check`, `mise test`, `mise release` (prepara `dist/` y sus sumas, no publica) y `mise publish` (publicación explícita en GitHub).

- El intérprete del entorno virtual `.venv` tiene prioridad; si no existe, las tareas usan el lanzador de Python del sistema. Ejecuta `mise setup` antes de `mise test`.
- `--plan` muestra lo que se ejecutaría sin ejecutar, escribir ni consultar la red. `--check` solo lee.
