import { Injectable } from '@nestjs/common';
import { CreatePlayerStatDto } from './dto/create-player-stat.dto';
import { UpdatePlayerStatDto } from './dto/update-player-stat.dto';
import { InjectModel } from '@nestjs/mongoose';
import { PlayerStat } from './entities/player-stat.entity';
import { Model } from 'mongoose';
import { Player } from 'src/player/entities/player.entity';
import { Round } from 'src/round/entities/round.entity';

@Injectable()
export class PlayerStatsService {

 constructor(
    @InjectModel(PlayerStat.name) private playerStatModel: Model<PlayerStat>,
    @InjectModel(Player.name) private playerModel: Model<Player>,
    @InjectModel(Round.name) private roundModel: Model<Round>,
  ) {}




  async generateRandomStatsForAllRounds(): Promise<void> {
    const rounds = await this.roundModel.find();
    const players = await this.playerModel.find();

    for (const round of rounds) {
      for (const player of players) {
        const score = -1; // random score from 0 to 10

        await this.playerStatModel.create({
          player_id: player._id,
          round_id: round._id,
          score,
        });
      }
    }

    console.log('Player stats populated for all rounds.');
  }


  create(createPlayerStatDto: CreatePlayerStatDto) {
    return 'This action adds a new playerStat';
  }

  findAll() {
    return `This action returns all playerStats`;
  }

  findOne(id: number) {
    return `This action returns a #${id} playerStat`;
  }

  update(id: number, updatePlayerStatDto: UpdatePlayerStatDto) {
    return `This action updates a #${id} playerStat`;
  }

  remove(id: number) {
    return `This action removes a #${id} playerStat`;
  }
}
