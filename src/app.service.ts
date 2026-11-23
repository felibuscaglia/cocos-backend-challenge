import { HttpStatus, Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  get health(): HttpStatus {
    return HttpStatus.OK;
  }
}
