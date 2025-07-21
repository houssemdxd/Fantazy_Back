import { Injectable } from '@nestjs/common';
import { CreateRoundDto } from './dto/create-round.dto';
import { UpdateRoundDto } from './dto/update-round.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Round, RoundDocument } from './entities/round.entity';
import { Model } from 'mongoose';

@Injectable()
export class RoundService {
   constructor(
    @InjectModel(Round.name) private roundModel: Model<RoundDocument>,
  ) {}





  async createRound(): Promise<Round> {
    const lastRound = await this.roundModel
      .findOne()
      .sort({ roundNumber: -1 })
      .exec();

    const newRoundNumber = lastRound ? lastRound.roundNumber + 1 : 1;

    const newRound = new this.roundModel({ roundNumber: newRoundNumber });
    return newRound.save();
  }


  

  findAll() {
    return `This action returns all round`;
  }

  findOne(id: number) {
    return `This action returns a #${id} round`;
  }

  update(id: number, updateRoundDto: UpdateRoundDto) {
    return `This action updates a #${id} round`;
  }

  remove(id: number) {
    return `This action removes a #${id} round`;
  }
}
