import { describe, expect, it } from 'vitest';
import { buttonReply, carouselReply, listReply } from './replies';

describe('respuestas simuladas: lo que entregaría Meta', () => {
  it('botón de respuesta → el título', () => {
    expect(buttonReply({ id: 'agendar', title: '📅 Agendar' })).toEqual({
      content: '📅 Agendar',
      label: '📅 Agendar',
    });
  });

  it('fila de lista → el id, con el título en la burbuja', () => {
    expect(listReply({ id: 'svc-engargolado', title: 'Engargolado' })).toEqual({
      content: 'svc-engargolado',
      label: 'Engargolado',
    });
  });

  it('fila sin id → el título', () => {
    expect(listReply({ id: '', title: 'Engargolado' }).content).toBe('Engargolado');
  });

  it('card de carrusel → el id del quick reply', () => {
    expect(carouselReply({ id: 'prod-cuaderno', title: 'Lo quiero' })).toEqual({
      content: 'prod-cuaderno',
      label: 'Lo quiero',
    });
  });

  it('card con id sintético btn_<n> → el título, igual que el parser', () => {
    expect(carouselReply({ id: 'btn_1', title: 'Ver más' }).content).toBe('Ver más');
    expect(carouselReply({ id: 'btn_c1', title: 'Ver más' }).content).toBe('btn_c1');
  });
});
