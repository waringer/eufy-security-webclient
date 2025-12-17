# Theme System Dokumentation

## Übersicht

Die CSS-Struktur ist jetzt in **3 separate Dateien** aufgeteilt:

### 1. **styles.css** (Base/Structure)
Die Hauptstilsheet mit all der Struktur und dem Layout. Alle Farben werden über CSS-Variablen definiert, sodass die Themes die Farben überschreiben können.

### 2. **dark-theme.css** (Dunkles Theme)
Definiert die CSS-Variablen für das dunkle Theme:
- Dunkle Hintergründe (#1a1a1a, #2a2a2a)
- Helle Texte (#e0e0e0)
- Blaue Akzente (#4db8ff)

### 3. **light-theme.css** (Helles Theme)
Definiert die CSS-Variablen für das helle Theme:
- Helle Hintergründe (#f5f5f5, #ffffff)
- Dunkle Texte (#333333)
- Blaue Akzente (#0066cc)

## Theme wechseln

Um zwischen den Themes zu wechseln, ändere einfach **eine Zeile** in `index.html`:

```html
<!-- Dark Theme (Standard) -->
<link rel="stylesheet" href="dark-theme.css">

<!-- Light Theme -->
<link rel="stylesheet" href="light-theme.css">
```

Das ist alles! Die Datei `styles.css` mit den CSS-Variablen bleibt in beiden Fällen gleich und wird immer geladen.

## CSS-Variablen

Die folgenden CSS-Variablen sind verfügbar und können von den Themes definiert werden:

### Farben
- `--bg-primary`: Haupthintergrund
- `--bg-secondary`: Sekundärer Hintergrund (Panels, Modals)
- `--bg-tertiary`: Tertiärer Hintergrund
- `--text-primary`: Haupttextfarbe
- `--text-secondary`: Sekundäre Textfarbe
- `--text-tertiary`: Tertiäre Textfarbe

### Akzente & Borders
- `--border-color`: Standard Border
- `--border-light`: Heller Border
- `--accent-color`: Akzent/Highlight
- `--accent-hover`: Akzent beim Hover

### Komponenten
- `--button-bg`, `--button-bg-hover`, `--button-bg-active`: Button-Farben
- `--button-text`: Button Text
- `--input-bg`, `--input-text`: Input-Farben
- `--table-bg`, `--table-border`, `--table-label-bg`, `--table-label-text`, `--table-hover`: Tabellen-Farben
- `--modal-bg`, `--modal-overlay`, `--modal-border`, `--modal-header-border`: Modal-Farben
- `--status-bg`, `--status-border`, `--status-text`: Status-Bar-Farben
- `--shadow-dark`, `--shadow-light`: Shadow-Farben

## Ein neues Theme hinzufügen

1. Erstelle eine neue CSS-Datei, z.B. `custom-theme.css`
2. Definiere die CSS-Variablen mit deinen Farben:
```css
:root {
    --bg-primary: #deine-farbe;
    --text-primary: #deine-farbe;
    /* ... weitere Variablen ... */
}
```
3. Ändere `index.html` und lade deine Datei statt `dark-theme.css` oder `light-theme.css`
