import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class SignupDto {
  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @MinLength(8)
  password!: string;

  @IsString()
  @IsNotEmpty()
  companyName!: string;
}
