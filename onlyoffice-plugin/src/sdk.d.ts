// Narrow declarations for the documented SDK surface used by this plugin.
interface PresentationApi {GetCurrentSlide():{AddObject(o:unknown):void};GetWidth():number;GetHeight():number;}
declare const Api:{GetPresentation():PresentationApi;CreateImage(src:string,width:number,height:number):{SetPosition(x:number,y:number):void};};
declare const Asc:{scope:Record<string,unknown>;plugin:{
  init:()=>void;button:(id:number,windowId?:string)=>void;
  callCommand:(fn:()=>unknown,close?:boolean,recalculate?:boolean,callback?:(result:unknown)=>void)=>void;
  executeMethod:(name:string,args:unknown[],callback?:(value:unknown)=>void)=>void;
  executeCommand:(name:string,data:string)=>void;
};PluginWindow:new()=>{show:(config:Record<string,unknown>)=>void};};
interface Window{Asc:typeof Asc;}
