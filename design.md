# STRATELIQ — Manual de Lineamientos de Diseño (Design Guidelines)

Este documento detalla los principios de diseño y especificaciones técnicas de la interfaz de usuario de **STRATELIQ**. Su objetivo es asegurar la coherencia estética y de experiencia de usuario en futuras iteraciones de desarrollo, manteniendo un estilo de alta precisión al estilo **Apple / Linear / Stripe**.

---

## 1. Filosofía de Diseño: "Less is More"
El diseño se basa en **precisión extrema, bordes extra finos (hairlines), cero desorden visual y una tipografía sofisticada**. 
* **Profundidad mediante luminancia:** En lugar de sombras pesadas, la jerarquía y la profundidad se construyen usando pasos de color en el fondo y bordes finos de 1px.
* **El espacio en blanco es estructura:** Usamos el doble de padding habitual en los contenedores. El espacio vacío no es "desperdicio", es la herramienta estructural principal.
* **Animaciones secas y rápidas:** Nada de rebotes lentos. Las transiciones deben ser instantáneas y fluidas (máximo 200ms).

---

## 2. Paleta de Colores (Light / Dark Mode)
La paleta es sumamente restringida: base monocromática con un azul brillante exclusivo para acciones primarias y verde únicamente para éxitos/confirmaciones.

| Elemento | Modo Claro (Light) | Modo Oscuro (Dark) | Uso en Diseño |
| :--- | :--- | :--- | :--- |
| **Background** | `#FFFFFF` | `#06080F` | Fondo principal de la aplicación |
| **Surface** | `#F9FAFB` | `#0F1322` | Fondos de tarjetas, paneles y barras |
| **Foreground** | `#0A0F1C` | `#F8FAFC` | Texto primario e iconos principales |
| **Muted** | `#8A94A6` | `#64748B` | Textos secundarios y estados desactivados |
| **Border** | `#E5E7EB` | `#1E293B` | Hairlines y divisores estructurales |
| **Primary** | `#0066FF` | `#3B82F6` | Botones principales y estados de enfoque |
| **Success** | `#10B981` | `#10B981` | Exclusivo para confirmación de éxito y crecimiento |

---

## 3. Tipografía
El emparejamiento tipográfico combina la autoridad moderna en encabezados con la legibilidad densa de datos en el cuerpo.

* **Encabezados (Headings):** **`Manrope, sans-serif`**.
  * *Estrategia:* Estilo limpio y autoritario de tipo Apple. **NUNCA usar Inter para encabezados**.
  * *Clases Tailwind recomendadas:* `font-medium`, `font-semibold`, `font-bold` con trackings ajustados.
  * `h1`: `text-4xl sm:text-5xl lg:text-6xl tracking-tighter leading-none`
  * `h2`: `text-2xl sm:text-3xl lg:text-4xl tracking-tight leading-tight`
  * `h3`: `text-xl sm:text-2xl tracking-tight`

* **Cuerpo de Texto (Body):** **`Inter, sans-serif`**.
  * *Estrategia:* Legibilidad densa al estilo Stripe o Linear. Ideal para interfaces de chat y análisis de datos.
  * `Large`: `text-lg leading-relaxed`
  * `Default`: `text-base leading-relaxed`
  * `Small`: `text-sm text-muted-foreground`
  * `Micro`: `text-xs uppercase tracking-[0.2em] font-medium`

---

## 4. Elementos Visuales Clave
* **Bordes Hairline:** Utilizar bordes finos de 1px (`border border-border/40`) para definir estructuras en lugar de rellenar con colores de fondo.
* **Bordes Redondeados (Border Radius):** 
  * Contenedores y Cards principales: `rounded-xl`
  * Botones e inputs estándar: `rounded-lg`
  * Inputs gigantes de Dashboard: `rounded-2xl`
* **Sombras Ambientales:** Extremadamente suaves y sutiles. Usar `shadow-sm` o un valor de sombra muy difuminado como `shadow-[0_4px_24px_rgba(0,0,0,0.04)]` en tarjetas. Evitar sombras duras o oscuras.
* **Glassmorphism:** Para cabeceras pegajosas (sticky headers) y la barra de navegación móvil. Usar `backdrop-blur-xl bg-background/80`. **NUNCA usar transparencias totales sin desenfoque de fondo**.

---

## 5. Iconografía
* Usar **Lucide React** de manera exclusiva para todos los iconos.
* **Importante:** Todos los iconos deben tener configurado un ancho de trazo fino: **`strokeWidth={1.5}`** para mantener el estilo Apple premium.
* **NUNCA** usar emojis en lugar de iconos estructurales.

---

## 6. Layouts y Componentes

### Botones (Buttons)
* **Pill-shaped o Redondeados:** `rounded-full` o `rounded-lg` según el contexto.
* **Primario:** `bg-primary text-white hover:opacity-90`
* **Secundario:** `bg-surface border border-border text-foreground`

### Campos de Entrada (Inputs)
* **Dashboard Hero Input:** Un buscador de decisión gigante (`h-16 text-xl rounded-2xl px-6`).
* **Inputs normales:** `h-10 rounded-lg border border-border/40`.
* **Focus State:** Siempre debe incluir un anillo de enfoque de alto contraste: `focus:ring-2 focus:ring-primary focus:ring-offset-2`.

### Estructura de Navegación (Shell)
* **En Escritorio (Desktop):** Sidebar izquierdo colapsable (`w-64`). El contenido principal tiene un ancho máximo de `max-w-5xl mx-auto` con márgenes generosos (`p-8` a `p-12`).
* **En Móvil (Mobile First):** Barra de navegación inferior fija (`fixed bottom-0 w-full`) con glassmorphism. Máximo 5 opciones principales: Dashboard, Chat, Empresa, Historial y Configuración. Sin menú hamburguesa para navegación primaria.

### Vistas Comunes
* **Bento Grid:** Para accesos rápidos del dashboard, usar grillas responsivas `grid-cols-2 md:grid-cols-3 gap-4` con tarjetas planas de borde fino y un leve efecto de elevación en hover (`hover:-translate-y-[1px] hover:shadow-md`).
* **Historial:** Lista densa al estilo Gmail. Usar solo separadores inferiores de 1px. Evitar tarjetas toscas o bloques innecesarios.
* **Chat:** Estilo comité estratégico. Burbujas minimalistas, tipografía de alta precisión y etiquetas claras para categorías (ej. `Finanzas`, `Marketing`).

---

## 7. Accesibilidad y Calidad de Código
* **Contraste de Color:** Asegurar que todo texto cumpla con estándares WCAG AA.
* **Lectores de Pantalla:** Agregar `aria-label` descriptivos a los botones que solo contienen iconos (ej. botón para colapsar barra lateral).
* **Atributos de Test:** Todo elemento interactivo clave debe contener un atributo `data-testid` (ej. `data-testid="decision-input"`, `data-testid="login-button"`) para facilitar las pruebas automatizadas (Playwright/Jest).
