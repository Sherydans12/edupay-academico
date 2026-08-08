import { SetMetadata } from '@nestjs/common';

import { IS_PUBLIC_ENDPOINT } from './authentication.constants';

export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_ENDPOINT, true);
