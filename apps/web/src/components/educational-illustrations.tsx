import type { SVGProps } from 'react';

/**
 * Ilustración vectorial educativa personalizada para el Hero de bienvenida del docente.
 * Representa el entorno pedagógico: libro abierto, birrete académico, lápiz, destellos de conocimiento
 * y tablet con notas en colores armoniosos (azul índigo, turquesa, ámbar y menta suave).
 */
export function TeacherHeroIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      viewBox="0 0 380 240"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <defs>
        {/* Gradientes de fondo y elementos */}
        <linearGradient id="hero-bg-glow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#dbeafe" stopOpacity="0.8" />
          <stop offset="50%" stopColor="#ede9fe" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#fef3c7" stopOpacity="0.4" />
        </linearGradient>

        <linearGradient id="book-cover-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#1d4ed8" />
        </linearGradient>

        <linearGradient id="book-page-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="90%" stopColor="#f8fafc" />
          <stop offset="100%" stopColor="#e2e8f0" />
        </linearGradient>

        <linearGradient id="pencil-body" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="50%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#d97706" />
        </linearGradient>

        <linearGradient id="grad-cap-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1e293b" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>

        <filter id="soft-shadow" x="-10%" y="-10%" width="130%" height="130%">
          <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="#0f172a" floodOpacity="0.08" />
        </filter>
        <filter id="float-shadow" x="-15%" y="-15%" width="140%" height="140%">
          <feDropShadow dx="0" dy="10" stdDeviation="12" floodColor="#1e293b" floodOpacity="0.12" />
        </filter>
      </defs>

      {/* Halo de luz orgánico de fondo */}
      <ellipse cx="190" cy="135" rx="155" ry="85" fill="url(#hero-bg-glow)" />

      {/* Partículas y destellos de aprendizaje flotantes */}
      <g opacity="0.85">
        {/* Estrella de excelencia 1 */}
        <path
          d="M 55 70 Q 55 58 67 58 Q 55 58 55 46 Q 55 58 43 58 Q 55 58 55 70 Z"
          fill="#f59e0b"
        />
        {/* Estrella de excelencia 2 */}
        <path
          d="M 330 65 Q 330 55 340 55 Q 330 55 330 45 Q 330 55 320 55 Q 330 55 330 65 Z"
          fill="#8b5cf6"
        />
        {/* Mini estrella 3 */}
        <path
          d="M 90 175 Q 90 168 97 168 Q 90 168 90 161 Q 90 168 83 168 Q 90 168 90 175 Z"
          fill="#10b981"
        />
        {/* Puntos de luz sutiles */}
        <circle cx="310" cy="160" r="4" fill="#38bdf8" />
        <circle cx="75" cy="115" r="3.5" fill="#f43f5e" opacity="0.6" />
        <circle cx="280" cy="40" r="3" fill="#fbbf24" />
      </g>

      {/* Sombra base del conjunto de libros */}
      <ellipse cx="190" cy="205" rx="125" ry="14" fill="#64748b" opacity="0.14" />

      {/* Tablet o Cuaderno de notas lateral (detrás del libro) */}
      <g transform="translate(245, 80) rotate(12)" filter="url(#soft-shadow)">
        <rect x="0" y="0" width="85" height="110" rx="10" fill="#ffffff" stroke="#e2e8f0" strokeWidth="2" />
        {/* Header de la tablet / cuaderno */}
        <rect x="0" y="0" width="85" height="24" rx="10" fill="#6366f1" />
        <rect x="0" y="14" width="85" height="10" fill="#6366f1" />
        <circle cx="42.5" cy="12" r="3" fill="#ffffff" opacity="0.8" />
        {/* Líneas de contenido / checklist */}
        <rect x="12" y="36" width="40" height="5" rx="2.5" fill="#94a3b8" opacity="0.5" />
        <rect x="12" y="48" width="60" height="4" rx="2" fill="#cbd5e1" />
        <rect x="12" y="58" width="55" height="4" rx="2" fill="#cbd5e1" />
        <rect x="12" y="68" width="45" height="4" rx="2" fill="#cbd5e1" />
        {/* Badge de check verde en la nota */}
        <circle cx="20" cy="88" r="8" fill="#ecfdf5" stroke="#10b981" strokeWidth="1.5" />
        <path d="M 16 88 L 19 91 L 24 85" stroke="#10b981" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <rect x="34" y="86" width="38" height="4" rx="2" fill="#10b981" opacity="0.7" />
      </g>

      {/* Libro principal abierto con efecto 3D isométrico suave */}
      <g filter="url(#float-shadow)">
        {/* Lomo y cubierta exterior izquierda */}
        <path
          d="M 95 188 C 135 184 175 195 190 202 L 190 115 C 175 107 135 96 95 102 Z"
          fill="url(#book-cover-grad)"
        />
        {/* Lomo y cubierta exterior derecha */}
        <path
          d="M 285 188 C 245 184 205 195 190 202 L 190 115 C 205 107 245 96 285 102 Z"
          fill="#1e40af"
        />

        {/* Páginas interiores izquierdas */}
        <path
          d="M 100 182 C 138 178 175 188 189 194 L 189 110 C 175 103 138 92 100 98 Z"
          fill="url(#book-page-grad)"
          stroke="#e2e8f0"
          strokeWidth="1"
        />
        {/* Páginas interiores derechas */}
        <path
          d="M 280 182 C 242 178 205 188 191 194 L 191 110 C 205 103 242 92 280 98 Z"
          fill="#ffffff"
          stroke="#e2e8f0"
          strokeWidth="1"
        />

        {/* Líneas de texto didáctico en la página izquierda */}
        <g opacity="0.55">
          <line x1="115" y1="118" x2="168" y2="121" stroke="#3b82f6" strokeWidth="3" strokeLinecap="round" />
          <line x1="115" y1="130" x2="172" y2="133" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="115" y1="141" x2="165" y2="144" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="115" y1="152" x2="160" y2="155" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="115" y1="163" x2="150" y2="166" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" />
        </g>

        {/* Gráfico / Diagrama didáctico en la página derecha */}
        <g opacity="0.75">
          <rect x="208" y="116" width="56" height="4" rx="2" fill="#8b5cf6" />
          {/* Mini gráfico de barras ilustrativo */}
          <rect x="210" y="152" width="8" height="16" rx="2" fill="#38bdf8" />
          <rect x="223" y="142" width="8" height="26" rx="2" fill="#4361ee" />
          <rect x="236" y="134" width="8" height="34" rx="2" fill="#10b981" />
          <rect x="249" y="146" width="8" height="22" rx="2" fill="#f59e0b" />
          <line x1="206" y1="170" x2="265" y2="170" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" />
        </g>

        {/* Separador de cinta roja/coral que cuelga del libro */}
        <path
          d="M 190 115 C 190 140 186 175 198 215 L 204 213 L 202 205 C 194 175 193 140 192 115 Z"
          fill="#f43f5e"
        />
      </g>

      {/* Lápiz flotante en perspectiva */}
      <g transform="translate(68, 115) rotate(-28)" filter="url(#soft-shadow)">
        {/* Cuerpo hexagonal del lápiz */}
        <polygon points="12,0 80,0 80,18 12,18" fill="url(#pencil-body)" />
        {/* Facetas de luz y sombra del lápiz */}
        <polygon points="12,0 80,0 80,6 12,6" fill="#fcd34d" />
        <polygon points="12,12 80,12 80,18 12,18" fill="#d97706" />
        {/* Casquillo metálico */}
        <polygon points="80,0 92,0 92,18 80,18" fill="#94a3b8" />
        <line x1="86" y1="0" x2="86" y2="18" stroke="#64748b" strokeWidth="1" />
        {/* Goma de borrar suave */}
        <path d="M 92,0 L 102,0 C 106,0 108,4 108,9 C 108,14 106,18 102,18 L 92,18 Z" fill="#fb7185" />
        {/* Punta de madera y grafito */}
        <polygon points="12,0 0,9 12,18" fill="#fed7aa" />
        <polygon points="4,6 0,9 4,12" fill="#334155" />
      </g>

      {/* Birrete académico moderno flotando sobre el libro */}
      <g transform="translate(142, 28) scale(1.05)" filter="url(#float-shadow)">
        {/* Rombo superior del birrete */}
        <polygon points="48,12 96,28 48,44 0,28" fill="url(#grad-cap-grad)" stroke="#334155" strokeWidth="1" />
        {/* Casquete inferior */}
        <path d="M 22,34 L 22,46 C 22,58 74,58 74,46 L 74,34 C 64,40 32,40 22,34 Z" fill="#0f172a" />
        {/* Botón central del birrete */}
        <ellipse cx="48" cy="28" rx="4" ry="2.5" fill="#f59e0b" />
        {/* Cinta y borla dorada colgante */}
        <path d="M 48,28 Q 78,32 82,48" stroke="#f59e0b" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        <polygon points="80,48 85,48 87,62 79,62" fill="#d97706" />
        <ellipse cx="83" cy="48" rx="2.5" ry="1.5" fill="#fef08a" />
      </g>
    </svg>
  );
}

/**
 * Ilustración para estado vacío cuando el profesor no tiene asignaturas asignadas aún.
 * Un portafolio pedagógico amigable y ordenado en tonos pastel.
 */
export function EmptyTeacherSubjectsIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      viewBox="0 0 200 160"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <defs>
        <linearGradient id="empty-folder-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#e0e7ff" />
          <stop offset="100%" stopColor="#ede9fe" />
        </linearGradient>
        <linearGradient id="folder-tab" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#4361ee" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
      </defs>

      {/* Círculo suave de fondo */}
      <circle cx="100" cy="80" r="64" fill="url(#empty-folder-bg)" opacity="0.75" />

      {/* Carpeta contenedora */}
      <g transform="translate(42, 38)">
        {/* Pestaña trasera */}
        <path d="M 6 18 L 36 18 L 46 26 L 110 26 C 114 26 116 28 116 32 L 116 80 C 116 84 114 86 110 86 L 6 86 C 2 86 0 84 0 80 L 0 24 C 0 20 2 18 6 18 Z" fill="#93c5fd" opacity="0.6" />

        {/* Documentos asomándose de la carpeta */}
        <rect x="22" y="10" width="72" height="65" rx="5" fill="#ffffff" stroke="#e2e8f0" strokeWidth="1.5" />
        <rect x="32" y="20" width="34" height="4" rx="2" fill="#60a5fa" />
        <rect x="32" y="28" width="52" height="3" rx="1.5" fill="#cbd5e1" />
        <rect x="32" y="35" width="46" height="3" rx="1.5" fill="#cbd5e1" />
        <rect x="32" y="42" width="38" height="3" rx="1.5" fill="#cbd5e1" />

        {/* Frontal de la carpeta */}
        <path d="M 0 36 C 0 32 3 30 7 30 L 109 30 C 113 30 116 32 116 36 L 112 82 C 112 86 109 88 105 88 L 11 88 C 7 88 4 86 4 82 Z" fill="url(#folder-tab)" />

        {/* Etiqueta de la carpeta */}
        <rect x="38" y="52" width="40" height="14" rx="4" fill="#ffffff" opacity="0.9" />
        <rect x="44" y="57" width="28" height="4" rx="2" fill="#3b82f6" />
      </g>

      {/* Destellos dorados */}
      <path d="M 152 40 Q 152 32 158 32 Q 152 32 152 24 Q 152 32 146 32 Q 152 32 152 40 Z" fill="#f59e0b" />
      <circle cx="38" cy="55" r="3" fill="#10b981" />
      <circle cx="165" cy="98" r="2.5" fill="#8b5cf6" />
    </svg>
  );
}

/**
 * Gráfico estilizado para el panel de revisiones pendientes.
 * Muestra una libreta con checklist y badge de acción.
 */
export function PriorityReviewIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      viewBox="0 0 120 100"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <defs>
        <linearGradient id="review-badge-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fef3c7" />
          <stop offset="100%" stopColor="#fed7aa" />
        </linearGradient>
      </defs>

      {/* Círculo suave de fondo */}
      <circle cx="60" cy="50" r="42" fill="url(#review-badge-bg)" opacity="0.8" />

      {/* Portapapeles con clip */}
      <g transform="translate(32, 14)">
        {/* Tablero */}
        <rect x="2" y="6" width="52" height="66" rx="6" fill="#ffffff" stroke="#e2e8f0" strokeWidth="1.5" />
        {/* Clip superior */}
        <rect x="18" y="2" width="20" height="8" rx="3" fill="#f59e0b" />
        <rect x="23" y="0" width="10" height="4" rx="1.5" fill="#d97706" />

        {/* Tareas del checklist */}
        <circle cx="12" cy="24" r="4" fill="#ecfdf5" stroke="#10b981" strokeWidth="1.2" />
        <path d="M 10 24 L 11.5 25.5 L 14 22.5" stroke="#10b981" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <rect x="20" y="22" width="26" height="4" rx="2" fill="#64748b" opacity="0.4" />

        <circle cx="12" cy="38" r="4" fill="#ecfdf5" stroke="#10b981" strokeWidth="1.2" />
        <path d="M 10 38 L 11.5 39.5 L 14 36.5" stroke="#10b981" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <rect x="20" y="36" width="28" height="4" rx="2" fill="#64748b" opacity="0.4" />

        {/* Tarea pendiente destacada con punto ámbar */}
        <circle cx="12" cy="52" r="4" fill="#fffbeb" stroke="#f59e0b" strokeWidth="1.5" />
        <rect x="20" y="50" width="22" height="4" rx="2" fill="#f59e0b" />
      </g>

      {/* Lápiz rojo/coral de corrección */}
      <g transform="translate(70, 48) rotate(32)">
        <rect x="0" y="0" width="32" height="8" rx="2" fill="#f43f5e" />
        <polygon points="32,0 40,4 32,8" fill="#fed7aa" />
        <polygon points="37,2.5 40,4 37,5.5" fill="#0f172a" />
      </g>
    </svg>
  );
}
