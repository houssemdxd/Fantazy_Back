import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { FantasyTeamService } from './fantasy-team.service';
import { CreateFantasyTeamDto } from './dto/create-fantasy-team.dto';
import { UpdateFantasyTeamDto } from './dto/update-fantasy-team.dto';
import { Types } from 'mongoose';

@Controller('fantasy-team')
export class FantasyTeamController {
  constructor(private readonly fantasyTeamService: FantasyTeamService) {}




@Get('liveupdates')
  async liveupdates() {
   
    return this.fantasyTeamService.updateLivePlayerStatsFromApi();
  }





@Get('weeklyscore/:userId')
  async calculateweekyscores(@Param('userId') userId: string) {
   
    return this.fantasyTeamService.calculateScore(userId);
  }





// GET LIST ROUNDS WITH PLAYERSTATS OF A USER 
@Get('user-scores/:userId')
  async getUserFantasyTeamWithScores(@Param('userId') userId: string) {
    const userObjectId = new Types.ObjectId(userId);
    return this.fantasyTeamService.getPlayerStatsByUser(userId);
  }

@Get('user/:userId')
async getByUserId(@Param('userId') userId: string) {
  return this.fantasyTeamService.getLatestFantasyTeamWithAdversaryInfo(userId);
}
@Get('test')
  getMockFixtures() {
    return this.fantasyTeamService.getSimplifiedFixtures();
  }

 @Post()
  async saveFantasyTeam(
    @Body()
    body: {
      userId: string;
      players: {
        player_id: number;
        isCaptain: boolean;
        isViceCaptain: boolean;
        isBench: boolean;
      }[];
    },
  ) {
    return this.fantasyTeamService.saveFantasyTeam(body.userId, body.players);
  }



  /*@Post()
  create(@Body() createFantasyTeamDto: CreateFantasyTeamDto) {
    return this.fantasyTeamService.create(createFantasyTeamDto);
  }*/

  @Get()
  findAll() {
    return this.fantasyTeamService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.fantasyTeamService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateFantasyTeamDto: UpdateFantasyTeamDto) {
    return this.fantasyTeamService.update(+id, updateFantasyTeamDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.fantasyTeamService.remove(+id);
  }
}
