# Feature: multilingüe con un fichero por idioma (ES/EN)

- **Estado:** implementado y verificado (2026-10-01)
- **ADR relacionado:** ADR-0001 (md→html con Eleventy), ADR-0002 (`/blog` → `/news`)
- **Modelo de campos:** [`docs/admin-fields.md`](../admin-fields.md)

## Decisión

**Opción A — un fichero por idioma.** Cada idioma es su propio `.md` con su
propio slug, su propio front matter y su propio `body`. No se mezclan idiomas
en un fichero ni se fingen traducciones que no existen.

```
content/news/las-mejores-apps-salud-2026.md        → /news/las-mejores-apps-salud-2026.html     (es)
content/news/en/best-health-fitness-apps-2026.md   → /news/en/best-health-fitness-apps-2026.html (en)
```

**La URL va en el idioma del artículo:** el nombre del fichero *es* el slug
de su URL, y la carpeta (`news/` vs `news/en/`) fija el idioma. El título del
md puede ser igual en ambos; la URL no.

## Emparejado: `translationKey`

Los dos archivos de una misma pieza comparten `translationKey` en el front
matter (no el nombre de fichero — así los slugs pueden diferir libremente
entre idiomas):

```yaml
# es: content/news/las-mejores-apps-salud-2026.md
translationKey: apps-salud-2026
# en: content/news/en/best-health-fitness-apps-2026.md
translationKey: apps-salud-2026
```

El escaneo ocurre en build (`content.11tydata.js` → `alternates`): para cada
artículo se buscan hermanos con la misma `translationKey` en el *otro* idioma
(excluyéndose a sí mismo con `path.resolve`). Si **no existe hermano**:

* **No se emite ningún `hreflang`** (ni `x-default`, ni `og:locale:alternate`)
  — SEO honesto: solo se declara lo que existe.
* No se muestra el aviso de idioma alternativo.

Con hermano, cada página emite:

```html
<link rel="alternate" hreflang="es" href="https://nebulosa.estudio/news/<slug-es>.html" />
<link rel="alternate" hreflang="en" href="https://nebulosa.estudio/news/en/<slug-en>.html" />
<link rel="alternate" hreflang="x-default" href="…" />   <!-- según site.xDefault -->
<div class="lang-notice">…Español → / English →</div>     <!-- aviso + enlace real -->
data-alt-es="…" data-alt-en="…"                            <!-- para el cambio de idioma -->
```

* `hreflang` es **auto-referencial en el idioma propio** + el hermano —
  requisito de Google para conjuntos hreflang.
* `x-default` apunta al idioma que decida `site.xDefault` (`"es"` | `"en"`),
  con la URL del hermano resuelta cruzadamente (`xDefaultUrl`).
* El `<html lang>` **no** se altera desde `navigator.language`: la página
  declara siempre su propio idioma real (correcto para SEO y accesibilidad).

## Cambio de idioma

El botón de idioma en la barra de navegación:

1. Si existe traducción real (`data-alt-es`/`data-alt-en`) → **navega** a la
   URL de la otra lengua.
2. Si no existe → solo alterna el *chrome* bilingüe de la página (spans
   `lang="es"`/`lang="en"` de la UI legacy), sin inventar URLs.

## Localización automática de contenido

Lo que se rellena solo según el idioma del fichero (sin tocar el `.md`):

| Dato | ES | EN |
|---|---|---|
| `author.bio` del registry | `bio` | `bioEn` |
| `reviewer.role` / `.credentials` | `role`, `credentials` | `roleEn`, `credentialsEn` |
| Fechas (`pubDate`…), tiempo de lectura | formato `es-ES` | formato `en-US` |
| `inLanguage` (JSON-LD, OG) | `es-ES` | `en-US` |
| `og:locale` | `es_ES` | `en_US` |
| Footer/nav (spans legacy) | `labelEs` | `labelEn` |

Los artículos **sin hermano** se listan solo en su propio índice
(`/news/` vs `/news/en/`); los índices sí están emparejados entre sí por
`translationKey` y emiten su propio par `hreflang`.

## Reglas al crear un artículo

1. Elegir idioma → el fichero va a `content/news/` (es) o `content/news/en/` (en).
2. Slug kebab-case **en el idioma del artículo** (ASCII).
3. Si hay traducción: mismo `translationKey` en ambos ficheros (el formulario
   del admin lo autocompleta con el slug y avisa si hay colisión en el mismo
   idioma — eso es un **error**, no un aviso).
4. Permalink: `/news/[en/]<slug>.html` (el form lo genera solo).
5. `lang` en front matter = `es` | `en` según la carpeta (redundante pero
   explícita; el build lo deriva igualmente de la ruta).

## Verificación

Checks automatizados vigentes (27/27 en la última ejecución): pares `hreflang`
reales en ambos sentidos, `x-default` según `site.xDefault`, ausencia de
`?lang=`, `data-alt-*`, canonical e `inLanguage` por idioma, índices con
contenido por idioma (el ES no lista artículos EN y viceversa), JSON-LD de
10 nodos por página y avisos de idioma solo cuando existe traducción.
