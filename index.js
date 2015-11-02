export default bot => {
  // read configurations from bot.data, users set bot.data in initialize.js
  let data = bot.data.template;

  // add a help record for your plugin's commands
  bot.help('call', 'calls someone', 'call <name>');
}
