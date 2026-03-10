import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Accepts both JWT (Authorization: Bearer) and API key (x-api-key header). */
@Injectable()
export class JwtAuthGuard extends AuthGuard(['jwt', 'api-key']) {}