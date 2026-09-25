#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { BellaMujerApiStack } from '../lib/bella-mujer-api-stack';

const app = new cdk.App();

new BellaMujerApiStack(app, 'BellaMujerApiStack', {
  description: 'Bella Mujer Studio API and admin authentication scaffold'
});
