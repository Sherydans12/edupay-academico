'use client';

import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  Dialog,
  DropdownItem,
  DropdownMenu,
  EmptyState,
  Input,
  Select,
  Skeleton,
  Tabs,
  TenantTheme,
  Textarea,
  Tooltip,
} from '@edupay/ui';

import { Icon } from '@/components/icons';

export function ComponentShowcase() {
  return (
    <main className="showcase-page">
      <header><h1>Fundación de interfaz</h1><p>Ruta interna de revisión. Los componentes son neutrales y reciben su identidad mediante tokens semánticos.</p></header>
      <section className="showcase-theme-compare">
        <TenantTheme className="showcase-theme" theme="default"><span>Tema neutral seguro</span><Button>Acción principal</Button><Badge tone="success">Publicado</Badge></TenantTheme>
        <TenantTheme className="showcase-theme" theme="colegio-conquistadores"><span>Tema Colegio Conquistadores</span><Button>Acción principal</Button><Badge tone="success">Publicado</Badge></TenantTheme>
      </section>
      <section className="showcase-section"><h2>Acciones y estados</h2><div className="showcase-row"><Button>Guardar cambios</Button><Button variant="accent">Continuar</Button><Button variant="secondary">Vista previa</Button><Button variant="ghost">Cancelar</Button><Button disabled>Desactivado</Button><Button loading>Cargando</Button></div><div className="showcase-row"><Badge tone="info">En curso</Badge><Badge tone="success"><Icon name="check" />Publicado</Badge><Badge tone="warning"><Icon name="clock" />Entrega próxima</Badge><Badge tone="error">Error</Badge><Badge tone="creative">Borrador</Badge></div></section>
      <section className="showcase-grid"><Card className="showcase-section"><h2>Campos</h2><div className="showcase-form"><Input hint="Texto de ayuda asociado al campo." id="showcase-title" label="Título de la actividad" placeholder="Ej. Reseña literaria"/><Select id="showcase-type" label="Tipo de contenido"><option>Material</option><option>Actividad</option><option>Evaluación en documento</option></Select><Textarea id="showcase-instructions" label="Instrucciones" placeholder="Describe qué debe hacer el estudiante…"/><Checkbox description="Solo será visible cuando la publicación esté autorizada." id="showcase-publish" label="Marcar para publicación"/></div></Card><Card className="showcase-section"><h2>Retroalimentación</h2><div className="showcase-stack"><Alert title="Cambios guardados" tone="success">La versión local se actualizó correctamente.</Alert><Alert title="Revisa el plazo" tone="warning">La actividad vence dentro de 24 horas.</Alert><Alert title="No fue posible cargar" tone="error">Conservamos tu selección. Intenta nuevamente.</Alert><Skeleton style={{ height: '4rem' }}/><EmptyState description="Cuando existan entregas por revisar aparecerán aquí." icon={<Icon name="review"/>} title="Sin revisiones pendientes"/></div></Card></section>
      <section className="showcase-section"><h2>Interacción</h2><div className="showcase-row"><Dialog description="Ejemplo de foco protegido para una decisión breve." openLabel="Abrir diálogo" title="Confirmar publicación"><p>La publicación real seguirá requiriendo autorización del backend.</p><div className="showcase-dialog-actions"><Button variant="secondary">Cancelar</Button><Button>Confirmar</Button></div></Dialog><DropdownMenu label="Acciones de contenido" trigger={<Button variant="secondary">Más acciones <Icon name="chevron-down"/></Button>}><DropdownItem>Duplicar visualmente</DropdownItem><DropdownItem>Archivar</DropdownItem></DropdownMenu><Tooltip content="Información adicional accesible con teclado"><Button size="icon" variant="ghost"><Icon name="spark"/><span className="sr-only">Ver ayuda</span></Button></Tooltip><Avatar name="Camila Rojas"/></div><Tabs label="Ejemplo de pestañas" items={[{ id: 'route-demo', label: 'Ruta', content: <p>Contenido de la ruta de aprendizaje.</p> }, { id: 'submissions-demo', label: 'Entregas', content: <p>Contenido de entregas.</p> }]}/></section>
    </main>
  );
}
