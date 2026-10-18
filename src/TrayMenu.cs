using System;
using System.Collections.Generic;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Effects;
using System.Windows.Media.Imaging;
using Shape = System.Windows.Shapes.Path;

namespace Memoir {
    // A native, composited menu: no browser process is needed for a tray click.
    internal sealed class TrayMenu : Window {
        private readonly Border panel;
        private readonly List<Button> buttons = new List<Button>();
        private readonly ScaleTransform scale = new ScaleTransform(.94,.94);
        private readonly TranslateTransform glide = new TranslateTransform(0,7);
        private readonly bool animated = SystemParameters.ClientAreaAnimation;
        private bool closing;
        private readonly Action<string> selected;
        [StructLayout(LayoutKind.Sequential)] private struct Rect { public int Left,Top,Right,Bottom; }
        [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr hwnd,out Rect rect);
        [DllImport("user32.dll")] private static extern bool SetWindowPos(IntPtr hwnd,IntPtr after,int x,int y,int width,int height,uint flags);
        public TrayMenu(string directory, Dictionary<string,object> appearance, bool paused, System.Drawing.Point anchor, Action<string> selected) {
            this.selected=selected;
            Title="Memoir actions"; Width=268; Height=274; WindowStyle=WindowStyle.None; ResizeMode=ResizeMode.NoResize; AllowsTransparency=true; Background=Brushes.Transparent; ShowInTaskbar=false; Topmost=true; WindowStartupLocation=WindowStartupLocation.Manual;
            var palette=Json.Map(Json.Get(appearance,"palette"));
            string theme=Json.Text(Json.Get(appearance,"theme"),"light");
            bool dark=theme=="dark"||theme=="pink";
            Color surface=ColorOf(Json.Text(Json.Get(palette,"surface")),theme=="pink"?"#3a2331":dark?"#1c1c1e":"#ffffff");
            Color label=ColorOf(Json.Text(Json.Get(palette,"label")),dark?"#f5f5f7":"#1d1d1f");
            Color secondary=ColorOf(Json.Text(Json.Get(palette,"secondary")),dark?"#a1a1a6":"#6e6e73");
            Color hover=ColorOf(Json.Text(Json.Get(palette,"hover")),dark?"#26ffffff":"#14787880");
            FontFamily=new FontFamily("Segoe UI Variable Text, Segoe UI"); FontSize=13;
            var root=new Grid {Margin=new Thickness(16)};
            panel=new Border {Background=new SolidColorBrush(surface),BorderBrush=new SolidColorBrush(Color.FromArgb(30,secondary.R,secondary.G,secondary.B)),BorderThickness=new Thickness(1),CornerRadius=new CornerRadius(17),Padding=new Thickness(8),Opacity=0,RenderTransformOrigin=new Point(.5,1),Effect=new DropShadowEffect {Color=Colors.Black,BlurRadius=24,ShadowDepth=5,Opacity=dark ? .35 : .14},CacheMode=new BitmapCache()};
            var transform=new TransformGroup();transform.Children.Add(scale);transform.Children.Add(glide);panel.RenderTransform=transform;
            var content=new StackPanel();panel.Child=content;root.Children.Add(panel);Content=root;
            var header=new StackPanel {Orientation=Orientation.Horizontal,Margin=new Thickness(10,4,10,10)};
            var image=new BitmapImage();image.BeginInit();image.CacheOption=BitmapCacheOption.OnLoad;image.UriSource=new Uri(System.IO.Path.Combine(directory,"web","icons","icon32.png"));image.EndInit();image.Freeze();
            header.Children.Add(new Image {Source=image,Width=25,Height=25,Margin=new Thickness(0,0,10,0),VerticalAlignment=VerticalAlignment.Center});
            var words=new StackPanel();words.Children.Add(new TextBlock {Text="Memoir",FontWeight=FontWeights.SemiBold,FontSize=13,Foreground=new SolidColorBrush(label)});words.Children.Add(new TextBlock {Text=paused?"Tracking paused":"Tracking screen time",FontSize=10.5,Foreground=new SolidColorBrush(secondary),Margin=new Thickness(0,1,0,0)});header.Children.Add(words);content.Children.Add(header);
            Add(content,"Open Memoir","report","M6,3 H3 V13 H13 V10 M9,2 H14 V7 M7,9 L14,2",label,secondary,hover);
            Add(content,"Today","today","M8,2 A6,6 0 1 1 7.99,2 M8,4.5 V8 L10.5,9.5",label,secondary,hover);
            Add(content,paused?"Resume tracking":"Pause tracking","pause",paused?"M5,2.5 L13,8 L5,13.5 Z":"M5.5,3 V13 M10.5,3 V13",label,secondary,hover);
            content.Children.Add(new Border {Height=1,Margin=new Thickness(10,5,10,5),Background=new SolidColorBrush(Color.FromArgb(32,secondary.R,secondary.G,secondary.B))});
            Add(content,"Quit Memoir","quit","M6,3 H3 V13 H6 M8,8 H14 M11,5 L14,8 L11,11",label,secondary,hover);
            content.Children.Add(new TextBlock {Text="Made by Mina Vian",FontSize=9.5,Foreground=new SolidColorBrush(secondary),Margin=new Thickness(11,6,0,0)});
            KeyboardNavigation.SetTabNavigation(content,KeyboardNavigationMode.Cycle);
            SourceInitialized+=delegate {
                IntPtr hwnd=new WindowInteropHelper(this).Handle;Rect bounds;GetWindowRect(hwnd,out bounds);int width=bounds.Right-bounds.Left,height=bounds.Bottom-bounds.Top;
                var area=System.Windows.Forms.Screen.FromPoint(anchor).WorkingArea;
                int x=Math.Max(area.Left+4,Math.Min(anchor.X-width+30,area.Right-width-4));
                int y=anchor.Y-height+12; if(y<area.Top+4)y=Math.Min(anchor.Y+8,area.Bottom-height-4);y=Math.Max(area.Top+4,Math.Min(y,area.Bottom-height-4));
                SetWindowPos(hwnd,IntPtr.Zero,x,y,0,0,0x15);
            };
            ContentRendered+=delegate { PlayIn(); };
            Deactivated+=delegate { Dismiss(); };
            PreviewKeyDown+=delegate(object sender,KeyEventArgs args) {
                if(args.Key==Key.Escape){args.Handled=true;Dismiss();}
                else if(args.Key==Key.Down||args.Key==Key.Up||args.Key==Key.Home||args.Key==Key.End){
                    int index=buttons.FindIndex(b=>b.IsKeyboardFocused);int next=args.Key==Key.Home?0:args.Key==Key.End?buttons.Count-1:index<0?(args.Key==Key.Up?buttons.Count-1:0):(index+(args.Key==Key.Down?1:-1)+buttons.Count)%buttons.Count;buttons[next].Focus();args.Handled=true;
                }
            };
        }
        private void Add(StackPanel parent,string text,string action,string geometry,Color label,Color secondary,Color hover) {
            var button=new Button {Height=34,Background=Brushes.Transparent,BorderThickness=new Thickness(0),Foreground=new SolidColorBrush(label),Padding=new Thickness(11,7,11,7),HorizontalContentAlignment=HorizontalAlignment.Left,Cursor=Cursors.Hand,Opacity=0,FocusVisualStyle=null,Tag=action};
            var template=new FrameworkElementFactory(typeof(Grid));template.SetValue(Panel.BackgroundProperty,Brushes.Transparent);
            var highlightPanel=new FrameworkElementFactory(typeof(Border),"Highlight");highlightPanel.SetValue(Border.CornerRadiusProperty,new CornerRadius(9));highlightPanel.SetValue(Border.BackgroundProperty,new SolidColorBrush(hover));highlightPanel.SetValue(UIElement.OpacityProperty,0.0);template.AppendChild(highlightPanel);
            var presenter=new FrameworkElementFactory(typeof(ContentPresenter));presenter.SetValue(FrameworkElement.MarginProperty,new Thickness(11,6,11,6));presenter.SetValue(FrameworkElement.VerticalAlignmentProperty,VerticalAlignment.Center);template.AppendChild(presenter);button.Template=new ControlTemplate(typeof(Button)){VisualTree=template};
            var row=new StackPanel {Orientation=Orientation.Horizontal};
            row.Children.Add(new Shape {Data=Geometry.Parse(geometry),Stroke=new SolidColorBrush(secondary),StrokeThickness=1.4,StrokeStartLineCap=PenLineCap.Round,StrokeEndLineCap=PenLineCap.Round,StrokeLineJoin=PenLineJoin.Round,Width=16,Height=16,Stretch=Stretch.Uniform,Margin=new Thickness(0,0,11,0)});
            row.Children.Add(new TextBlock {Text=text,VerticalAlignment=VerticalAlignment.Center});button.Content=row;
            System.Windows.Automation.AutomationProperties.SetName(button,text);
            var move=new TranslateTransform(0,4);button.RenderTransform=move;
            Action<bool> highlight=on=>{var background=button.Template.FindName("Highlight",button) as Border;if(background==null)return;if(animated){Animate(background,UIElement.OpacityProperty,on?1:0,180);Animate(move,TranslateTransform.XProperty,on?2:0,220);}else{background.Opacity=on?1:0;move.X=on?2:0;}};
            button.MouseEnter+=delegate{highlight(true);};button.MouseLeave+=delegate{highlight(button.IsKeyboardFocused);};button.GotKeyboardFocus+=delegate{highlight(true);};button.LostKeyboardFocus+=delegate{highlight(button.IsMouseOver);};
            button.Click+=delegate{Dismiss(action);};parent.Children.Add(button);buttons.Add(button);
        }
        private void PlayIn() {
            if(!animated){panel.Opacity=1;scale.ScaleX=scale.ScaleY=1;glide.Y=0;foreach(var button in buttons){button.Opacity=1;((TranslateTransform)button.RenderTransform).Y=0;}return;}
            Animate(panel,UIElement.OpacityProperty,1,220);Animate(scale,ScaleTransform.ScaleXProperty,1,360);Animate(scale,ScaleTransform.ScaleYProperty,1,360);Animate(glide,TranslateTransform.YProperty,0,360);
            for(int i=0;i<buttons.Count;i++){Animate(buttons[i],UIElement.OpacityProperty,1,190,30+i*22);Animate(buttons[i].RenderTransform,TranslateTransform.YProperty,0,260,30+i*22);}
        }
        public void Dismiss(string action=null) {
            if(closing)return;closing=true;IsHitTestVisible=false;
            Action finish=delegate{if(action!=null)selected(action);Close();};
            if(!animated){finish();return;}
            var fade=new DoubleAnimation(0,TimeSpan.FromMilliseconds(145)){EasingFunction=new CubicEase{EasingMode=EasingMode.EaseOut}};Timeline.SetDesiredFrameRate(fade,165);fade.Completed+=delegate{finish();};panel.BeginAnimation(UIElement.OpacityProperty,fade);
            Animate(glide,TranslateTransform.YProperty,4,145);Animate(scale,ScaleTransform.ScaleXProperty,.97,145);Animate(scale,ScaleTransform.ScaleYProperty,.97,145);
        }
        private static void Animate(Animatable element,DependencyProperty property,double target,int duration,int delay=0) {
            var animation=new DoubleAnimation(target,TimeSpan.FromMilliseconds(duration)){BeginTime=TimeSpan.FromMilliseconds(delay),EasingFunction=new CubicEase{EasingMode=EasingMode.EaseOut}};Timeline.SetDesiredFrameRate(animation,165);element.BeginAnimation(property,animation);
        }
        private static void Animate(UIElement element,DependencyProperty property,double target,int duration,int delay=0) {
            var animation=new DoubleAnimation(target,TimeSpan.FromMilliseconds(duration)){BeginTime=TimeSpan.FromMilliseconds(delay),EasingFunction=new CubicEase{EasingMode=EasingMode.EaseOut}};Timeline.SetDesiredFrameRate(animation,165);element.BeginAnimation(property,animation);
        }
        private static Color ColorOf(string value,string fallback) {
            try {
                var rgba=Regex.Match(value,@"rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)");
                if(rgba.Success)return Color.FromArgb(rgba.Groups[4].Success?(byte)(Double.Parse(rgba.Groups[4].Value,CultureInfo.InvariantCulture)*255):(byte)255,Byte.Parse(rgba.Groups[1].Value),Byte.Parse(rgba.Groups[2].Value),Byte.Parse(rgba.Groups[3].Value));
                return (Color)ColorConverter.ConvertFromString(String.IsNullOrWhiteSpace(value)?fallback:value);
            }catch{return (Color)ColorConverter.ConvertFromString(fallback);}
        }
    }
}
