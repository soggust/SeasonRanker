# A sample signed-in wallet built from the model's own ledger (the bot's real picks), for the captures only.
# Usage: python3 fixture.py <repo root> <out.json>
import json,random,datetime,collections,sys,os
random.seed(7)
R=os.path.join(sys.argv[1],'apps')+'/'
TIER={'high':'love','medium':'like','low':'like'}
def pay(odds,stake): return round(stake*(odds/100 if odds>0 else 100/-odds),2)
open_,settled=[],[]
for s in ['nfl','nhl','mlb','mma']:
    for b in json.load(open(R+s+'/src/StaticData/model/ledger.json'))['bets']:
        if b.get('intent') not in ('edge','action') or not b.get('pick'): continue
        stake=random.choice([5,10,10,15,20,25])
        bet={'id':b['id'],'sport':s,'event':b['event'],'matchup':b['matchup'],'start':b['start'],'market':b['market'],'side':b['side'],
             'line':b.get('line'),'odds':b['odds'],'stake':stake,'pick':b['pick'],'botPick':True,'tier':TIER.get(b.get('publishedLevel'),'like'),
             'kelly':b.get('publishedKelly'),'ref':b['id'] if b['market']=='prop' else None,'propType':b.get('propType'),'athlete':b.get('athlete'),
             'player':b.get('player'),'statLabel':b.get('statLabel'),'run':0,'placedAt':b['placedAt'],'status':b['status']}
        if b['status']=='open': open_.append(bet)
        elif b['status'] in ('won','lost','push'):
            bet['profit']=pay(b['odds'],stake) if b['status']=='won' else (-stake if b['status']=='lost' else 0)
            bet['final']=b.get('final'); bet['settledAt']=b.get('gradedAt') or b['start']
            settled.append(bet)
open_=sorted(open_,key=lambda x:x['placedAt'])[-7:]
settled=sorted(settled,key=lambda x:x['settledAt'])[-40:]
settled.reverse()
days=collections.defaultdict(lambda:[0,0,0,0,0]); sports=collections.defaultdict(dict)
allt={'won':0,'lost':0,'push':0,'void':0,'staked':0,'profit':0}
for b in settled:
    d=(datetime.datetime.fromisoformat(b['settledAt'].replace('Z','+00:00'))-datetime.timedelta(hours=4)).strftime('%Y-%m-%d')
    i={'won':0,'lost':1,'push':2}[b['status']]; days[d][i]+=1; days[d][3]+=b['stake']; days[d][4]=round(days[d][4]+b['profit'],2)
    sports[d][b['sport']]=round(sports[d].get(b['sport'],0)+b['profit'],2)
    allt[b['status']]+=1; allt['staked']+=b['stake']; allt['profit']=round(allt['profit']+b['profit'],2)
staked_open=sum(b['stake'] for b in open_)
fx={'user':{'uid':'sample','email':'sample@example.com','providers':['google.com'],'providerPhoto':None,'admin':False,'verified':True,
     'profile':{'username':'sampleplayer','usernameLower':'sampleplayer','displayName':'Sample Player','photo':None,'visibility':{}}},
    'wallet':{'balance':round(500+allt['profit']-staked_open,2),'start':500,'resets':0},
    'open':open_,'settled':settled,'tally':{'all':allt,'days':dict(days),'sports':dict(sports),'v':2}}
json.dump(fx,open(sys.argv[2],'w'))
print(len(open_),len(settled),allt,fx['wallet'])
