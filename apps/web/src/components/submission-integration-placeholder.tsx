import { Alert, Button } from '@edupay/ui';

import { Icon } from '@/components/icons';

export function SubmissionIntegrationPlaceholder({
  itemType,
}: {
  itemType: 'ASSIGNMENT' | 'ASSESSMENT';
}) {
  return (
    <section aria-labelledby="submission-seam-title" className="upload-panel submission-seam">
      <div className="upload-panel__heading">
        <div>
          <h2 id="submission-seam-title">Entrega de archivos</h2>
          <p>La actividad está conectada a Learning, pero la entrega se habilitará cuando Storage/Submissions publique sus contratos.</p>
        </div>
        <span className="upload-limit">{itemType === 'ASSESSMENT' ? 'Evaluación documental' : 'Actividad'}</span>
      </div>
      <div className="submission-seam__body">
        <span className="submission-seam__icon"><Icon name="upload" /></span>
        <div>
          <strong>Integración pendiente</strong>
          <p>No se seleccionan, suben ni guardan archivos en esta versión.</p>
        </div>
      </div>
      <Alert title="Aún no conectado" tone="info">
        Tu trabajo no se ha enviado. Este estado cambiará cuando se integre el flujo autorizado de archivos, entregas, historial y revisión.
      </Alert>
      <Button disabled><Icon name="upload" />Enviar trabajo</Button>
    </section>
  );
}
