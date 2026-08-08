import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import HomePage from './page';

describe('HomePage', () => {
  it('renders the technical bootstrap placeholder', () => {
    render(<HomePage />);

    expect(
      screen.getByRole('heading', { name: 'EduPay Academico' }),
    ).toBeTruthy();
    expect(
      screen.getByText(/web application foundation is running/i),
    ).toBeTruthy();
  });
});
