namespace SuperBot.Application.Commands
{
    public class OpenReferralProgramCommand : BaseMessageCommand
    {
        public long ChatId { get; set; }
        public string UserId { get; set; }
    }
}
