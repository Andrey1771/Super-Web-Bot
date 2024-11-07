using SuperBot.Core.Entities;

namespace SuperBot.Application.Commands.Telegram.Base
{
    public class ChangeDialogStateCommand : BaseMessageCommand
    {
        public long ChatId { get; set; }
        public DialogState DialogState { get; set; }
        public string Text { get; set; }

    }
}
