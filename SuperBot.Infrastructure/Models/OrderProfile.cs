using AutoMapper;
using SuperBot.Core.Entities;
using SuperBot.Infrastructure.Data;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace SuperBot.Infrastructure.Models
{
    public class OrderProfile : Profile
    {
        public OrderProfile()
        {
            CreateMap<Order, OrderDb>().ReverseMap();
        }
    }
}
