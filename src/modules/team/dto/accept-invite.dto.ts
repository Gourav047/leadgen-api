import { IsString, MinLength } from 'class-validator';

export class AcceptInviteDto {
  @IsString()
  token!: string;

  @IsString()
  username!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
