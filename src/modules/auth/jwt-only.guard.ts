import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Use on routes that must only be accessible via JWT (not API keys). */
@Injectable()
export class JwtOnlyGuard extends AuthGuard('jwt') {}
