import enClient from '../../locales/en/client.json';
import enCommands from '../../locales/en/commands.json';
import enGeneral from '../../locales/en/general.json';

interface Resources {
  general: typeof enGeneral;

  client: typeof enClient;

  commands: typeof enCommands;
}

export default Resources;
