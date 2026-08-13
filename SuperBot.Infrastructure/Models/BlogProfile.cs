using AutoMapper;
using SuperBot.Core.Entities;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Models
{
    public class BlogProfile : Profile
    {
        public BlogProfile()
        {
            CreateMap<BlogPost, BlogPostDb>().ReverseMap();
            CreateMap<BlogPostVersion, BlogPostVersionDb>().ReverseMap();
            CreateMap<BlogEvent, BlogEventDb>().ReverseMap();
            CreateMap<BlogComment, BlogCommentDb>().ReverseMap();
            CreateMap<BlogCommentBan, BlogCommentBanDb>().ReverseMap();
            CreateMap<BlogPostUniqueView, BlogPostUniqueViewDb>().ReverseMap();
            CreateMap<BlogViewSettings, BlogViewSettingsDb>().ReverseMap();
            CreateMap<UserBlogProfile, UserBlogProfileDb>().ReverseMap();
            CreateMap<BlogReadingHistoryItem, BlogReadingHistoryItemDb>().ReverseMap();
            CreateMap<BlogShownItem, BlogShownItemDb>().ReverseMap();
        }
    }
}
