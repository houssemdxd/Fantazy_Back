import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema()
export class Fixture extends Document {
  
  @Prop({ type: Types.ObjectId, ref: 'Team', required: true })
  homeTeam: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Team', required: true })
  awayTeam: Types.ObjectId;

  
@Prop({ type: Types.ObjectId, ref: 'Round' })
  round: Types.ObjectId;

  @Prop({ required: true })
  eventTime: string;

  @Prop({ required: true })
  date: string;

  @Prop({ required: true })
  league: string;

  @Prop({ required: true })
  event_status: string;

  @Prop({ default: false })
  cleancheat: boolean;
}

export const FixtureSchema = SchemaFactory.createForClass(Fixture);
