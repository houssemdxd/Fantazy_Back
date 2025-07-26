import { Module } from '@nestjs/common';
import { FantasyTeamService } from './fantasy-team.service';
import { FantasyTeamController } from './fantasy-team.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { FantasyTeamSchema } from './entities/fantasy-team.entity';
import { FixtureSchema } from 'src/fixture/entities/fixture.entity';
import { TeamSchema } from 'src/team/entities/team.entity';
import { RoundSchema } from 'src/round/entities/round.entity';
import { WeeklyTeamSchema } from 'src/weekly-team/entities/weekly-team.entity';
import { PlayerSchema } from 'src/player/entities/player.entity';
import { PlayerStatSchema } from 'src/player-stats/entities/player-stat.entity';
import { WeeklyScoreSchema } from 'src/weekly-score/entities/weekly-score.entity';

@Module({


   imports: [
    MongooseModule.forFeature([{ name: 'FantasyTeam', schema: FantasyTeamSchema },    
        { name: 'Fixture', schema: FixtureSchema },
        { name: 'Team', schema: TeamSchema }, // 👈 add this line
        { name: 'Round', schema: RoundSchema }, // 👈 add this line
        { name: 'WeeklyTeam', schema: WeeklyTeamSchema }, 
                { name: 'Player', schema: PlayerSchema }, // 👈 add this line
                                { name: 'PlayerStat', schema: PlayerStatSchema }, // 👈 add this line
                                 { name: 'WeeklyScore', schema: WeeklyScoreSchema },    


]),
  ],
  controllers: [FantasyTeamController],
  providers: [FantasyTeamService],
  exports:[FantasyTeamService]
})
export class FantasyTeamModule {}
