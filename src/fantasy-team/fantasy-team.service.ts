import { Injectable } from '@nestjs/common';
import { CreateFantasyTeamDto } from './dto/create-fantasy-team.dto';
import { UpdateFantasyTeamDto } from './dto/update-fantasy-team.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { FantasyTeam } from './entities/fantasy-team.entity';

@Injectable()
export class FantasyTeamService {


 constructor(
    @InjectModel('FantasyTeam') private readonly fantasyTeamModel: Model<FantasyTeam>,
  ) {}
async getFantasyTeamByUser(userId: string) {
  return this.fantasyTeamModel
    .find({ user_id: new Types.ObjectId(userId) })
    .populate('player_id')  // populate player details
    .exec();
}

async saveFantasyTeam(
    userId: string,
    players: {
      player_id: number;
      isCaptain: boolean;
      isViceCaptain: boolean;
      isBench: boolean;
    }[],
  ): Promise<FantasyTeam[]> {
    const userObjectId = new Types.ObjectId(userId);

    // Optional: delete old team before saving new one
    await this.fantasyTeamModel.deleteMany({ user_id: userObjectId });

    const fantasyTeamDocs = players.map((player) => ({
      user_id: userObjectId,
      player_id: player.player_id, // numeric _id of Player
      isCaptain: player.isCaptain,
      isViceCaptain: player.isViceCaptain,
      isBench: player.isBench,
    }));

    return this.fantasyTeamModel.insertMany(fantasyTeamDocs);
  }



  create(createFantasyTeamDto: CreateFantasyTeamDto) {
    return 'This action adds a new fantasyTeam';
  }

  findAll() {
    return `This action returns all fantasyTeam`;
  }

  findOne(id: number) {
    return `This action returns a #${id} fantasyTeam`;
  }

  update(id: number, updateFantasyTeamDto: UpdateFantasyTeamDto) {
    return `This action updates a #${id} fantasyTeam`;
  }

  remove(id: number) {
    return `This action removes a #${id} fantasyTeam`;
  }
}
