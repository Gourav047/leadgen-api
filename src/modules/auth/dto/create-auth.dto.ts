import { IsString, IsEmail, IsNotEmpty } from 'class-validator';

export class CreateAuthDto {
  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}
