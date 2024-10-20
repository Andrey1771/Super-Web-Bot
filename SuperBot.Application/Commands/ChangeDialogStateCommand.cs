using SuperBot.Core.Entities;

namespace SuperBot.Application.Commands
{
    public class ChangeDialogStateCommand : BaseCommand
    {
        public long ChatId { get; set; }
        public DialogState DialogState { get; set; }
    }
}
