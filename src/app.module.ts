import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RolesModule } from './roles/roles.module';
import { PlayerModule } from './player/player.module';
import { TeamModule } from './team/team.module';
import config from './config/config';
import { Team, TeamSchema } from './team/entities/team.entity';
import { Player, PlayerSchema } from './player/entities/player.entity';
import { FantasyTeamModule } from './fantasy-team/fantasy-team.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [config],
    }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (config) => ({
        secret: config.get('jwt.secret'),
      }),
      global: true,
      inject: [ConfigService],
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (config) => ({
        uri: config.get('database.connectionString'),
      }),
      inject: [ConfigService],
    }),
     MongooseModule.forFeature([
      { name: Team.name, schema: TeamSchema },
      { name: Player.name, schema: PlayerSchema }
    ]),
    AuthModule,
    RolesModule,
    PlayerModule,
    TeamModule,
    FantasyTeamModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
