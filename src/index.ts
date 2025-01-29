import {program} from 'commander'
import {parseYamlConfig, validateConfig} from './config'
import os from 'node:os'
import { ConfigSchemaType, rootConfigSchema } from './config-schema'
import { createServer } from './server';

async function main(){
    program.option('--config <path>');
    program.parse()

    const options = program.opts()
    if(options && 'config' in options){
        const validatedConfig = await validateConfig(await parseYamlConfig(options.config))
        await createServer({port: validatedConfig.server.listen, workerCount: validatedConfig.server.workers ?? os.cpus().length, config: validatedConfig
        })
    }
}
main()