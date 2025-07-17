import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { FantasyTeamService } from './fantasy-team.service';
import { CreateFantasyTeamDto } from './dto/create-fantasy-team.dto';
import { UpdateFantasyTeamDto } from './dto/update-fantasy-team.dto';

@Controller('fantasy-team')
export class FantasyTeamController {
  constructor(private readonly fantasyTeamService: FantasyTeamService) {}


@Get('user/:userId')
async getByUserId(@Param('userId') userId: string) {
  return this.fantasyTeamService.getFantasyTeamByUser(userId);
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
