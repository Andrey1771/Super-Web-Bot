using AutoMapper;
using SuperBot.Core.Entities;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Models;

public class CashbackProfile : Profile
{
    public CashbackProfile()
    {
        CreateMap<CashbackAccount, CashbackAccountDb>().ReverseMap();
        CreateMap<CashbackTransaction, CashbackTransactionDb>().ReverseMap();
    }
}
