using AutoMapper;
using SuperBot.Core.Entities;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Models
{
    public class GameDetailsProfile : Profile
    {
        public GameDetailsProfile()
        {
            CreateMap<GameDetails, GameDetailsDb>().ReverseMap();
            CreateMap<GameCover, GameCoverDb>().ReverseMap();
            CreateMap<GameMediaItem, GameMediaItemDb>().ReverseMap();
            CreateMap<GameStudioInfo, GameStudioInfoDb>().ReverseMap();
            CreateMap<GamePlatforms, GamePlatformsDb>().ReverseMap();
            CreateMap<GameLanguageSupport, GameLanguageSupportDb>().ReverseMap();
            CreateMap<GameAgeRating, GameAgeRatingDb>().ReverseMap();
            CreateMap<GameEdition, GameEditionDb>().ReverseMap();
            CreateMap<GameDlcItem, GameDlcItemDb>().ReverseMap();
            CreateMap<GameAwardBadge, GameAwardBadgeDb>().ReverseMap();
            CreateMap<GameSystemRequirements, GameSystemRequirementsDb>().ReverseMap();
            CreateMap<GameSystemRequirementBlock, GameSystemRequirementBlockDb>().ReverseMap();
            CreateMap<GameSystemRequirementSpec, GameSystemRequirementSpecDb>().ReverseMap();
            CreateMap<GameAutoRecommendRules, GameAutoRecommendRulesDb>().ReverseMap();
        }
    }
}
