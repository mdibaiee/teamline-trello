export default bot => {
  // read configurations from bot.config, users set bot.config in `config.js`
  let config = bot.config.template;

  // Add a help record for your plugin's commands
	// When the user issues `help`, there will be a list of command names along
	// with their short description (second argument).
	// If the user issues `help` with a command name, like `help example`,
	// the long description (last argument) will be shown.
  bot.help('example', 'shows an example', 'example <name>');
}
